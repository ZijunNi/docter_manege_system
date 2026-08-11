import Dexie from 'dexie'
import { db, ensureSeedData, LEGACY_DB_NAME } from '../db'
import { seedEventTypes } from '../db/seed-events'
import type { EventRange, EventRangeTask, EventType, PatientEvent } from '../types/event'
import type { Patient } from '../types/patient'
import type { OnceTaskCompletion, Task } from '../types/task'
import type { TaskCategory } from '../types/enums'
import { BUILT_IN_EVENT_IDS, createEntityId, onceCompletionId, stableRangeId, stableRangeTaskId } from '../utils/id'
import { repairDuplicatePatientEvents } from './data-repair-service'
import { generateDailyTasks } from '../engine/task-generator'
import { normalizeTaskStatusLabel } from '../utils/task-compat'

type Raw = Record<string, unknown>

export interface MigrationOrphan {
  legacyPatientEventId: string
  patientName: string
  eventDate: string
  missingEventTypeId: string
}

export type InitializationResult =
  | { status: 'ready'; migrated: boolean }
  | { status: 'needs-repair'; orphans: MigrationOrphan[]; eventTypes: Array<{ id: string; name: string; icon: string }> }

export interface MigrationDraft {
  patients: Patient[]
  tasks: Task[]
  eventTypes: EventType[]
  eventRanges: EventRange[]
  eventRangeTasks: EventRangeTask[]
  patientEvents: PatientEvent[]
  completions: OnceTaskCompletion[]
  orphanRows: Array<{ raw: Raw; orphan: MigrationOrphan; patientId: string }>
  legacyPatientIds: Record<string, string>
  legacyRangeIds: Record<string, string>
}

let pendingDraft: MigrationDraft | null = null

function legacyDb(): Dexie {
  const legacy = new Dexie(LEGACY_DB_NAME)
  legacy.version(9).stores({
    patients: '++id, isArchived, admissionDate',
    tasks: '++id, patientId, date, [patientId+date]',
    eventTypes: '++id, key',
    eventRanges: '++id, eventTypeId',
    eventRangeTasks: '++id, eventRangeId',
    patientEvents: '++id, patientId, eventTypeId, [patientId+eventTypeId]',
  })
  return legacy
}

export async function initializeDatabase(): Promise<InitializationResult> {
  const migrated = await db.meta.get('legacy-migration-complete')
  const stableRows = await Promise.all([
    db.patients.count(), db.tasks.count(), db.patientEvents.count(), db.eventTypes.count(),
  ])
  if (migrated || stableRows.some(count => count > 0)) {
    await ensureSeedData()
    await repairDuplicatePatientEvents()
    await generateDailyTasks()
    return { status: 'ready', migrated: Boolean(migrated) }
  }

  if (!await Dexie.exists(LEGACY_DB_NAME)) {
    await ensureSeedData()
    return { status: 'ready', migrated: false }
  }

  const legacy = legacyDb()
  try {
    await legacy.open()
    const [patients, tasks, eventTypes, eventRanges, rangeTasks, patientEvents] = await Promise.all([
      legacy.table('patients').toArray(),
      legacy.table('tasks').toArray(),
      legacy.table('eventTypes').toArray(),
      legacy.table('eventRanges').toArray(),
      legacy.table('eventRangeTasks').toArray(),
      legacy.table('patientEvents').toArray(),
    ]) as Raw[][]

    if (![patients, tasks, eventTypes, eventRanges, rangeTasks, patientEvents].some(rows => rows.length)) {
      await ensureSeedData()
      return { status: 'ready', migrated: false }
    }

    pendingDraft = buildLegacyDraft({ patients, tasks, eventTypes, eventRanges, rangeTasks, patientEvents })
    migrateLegacyCompletionLedger(pendingDraft)
    if (pendingDraft.orphanRows.length) {
      return {
        status: 'needs-repair',
        orphans: pendingDraft.orphanRows.map(row => row.orphan),
        eventTypes: seedEventTypes
          .filter(seed => seed.eventType.key !== 'temporary')
          .map(seed => ({ id: seed.eventType.id, name: seed.eventType.name, icon: seed.eventType.icon })),
      }
    }
    await commitDraft(pendingDraft, {})
    pendingDraft = null
    return { status: 'ready', migrated: true }
  } finally {
    legacy.close()
  }
}

export async function completeLegacyMigration(resolutions: Record<string, string>): Promise<void> {
  if (!pendingDraft) throw new Error('迁移草稿已失效，请刷新页面重新开始')
  for (const row of pendingDraft.orphanRows) {
    if (!resolutions[row.orphan.legacyPatientEventId]) {
      throw new Error(`尚未映射 ${row.orphan.patientName} ${row.orphan.eventDate} 的事件类型`)
    }
  }
  await commitDraft(pendingDraft, resolutions)
  pendingDraft = null
}

export function buildLegacyDraft(input: {
  patients: Raw[]; tasks: Raw[]; eventTypes: Raw[]; eventRanges: Raw[]; rangeTasks: Raw[]; patientEvents: Raw[]
}): MigrationDraft {
  const now = Date.now()
  const patientIds = new Map<string, string>()
  const patients: Patient[] = input.patients.map(raw => {
    const id = createEntityId('patient')
    patientIds.set(String(raw.id), id)
    return {
      id,
      name: String(raw.name || '未命名患者'),
      bedNumber: asOptionalString(raw.bedNumber),
      admissionDate: String(raw.admissionDate || ''),
      isArchived: raw.isArchived ? 1 : 0,
      notes: asOptionalString(raw.notes),
      createdAt: asNumber(raw.createdAt, now),
      updatedAt: asNumber(raw.updatedAt, now),
    }
  })

  const typeIds = new Map<string, string>()
  const selectedBuiltIns = new Map<string, Raw>()
  for (const raw of input.eventTypes) {
    const key = String(raw.key || '')
    if (key in BUILT_IN_EVENT_IDS) {
      const current = selectedBuiltIns.get(key)
      if (!current || compareLegacyCandidate(raw, current, input.patientEvents) < 0) selectedBuiltIns.set(key, raw)
    }
  }
  const eventTypes: EventType[] = []
  for (const raw of input.eventTypes) {
    const key = String(raw.key || `custom-${raw.id}`)
    if (key in BUILT_IN_EVENT_IDS) {
      const id = BUILT_IN_EVENT_IDS[key as keyof typeof BUILT_IN_EVENT_IDS]
      typeIds.set(String(raw.id), id)
      if (selectedBuiltIns.get(key) !== raw) continue
      eventTypes.push(toEventType(raw, id, key, true, now))
    } else {
      const id = createEntityId('event-type')
      typeIds.set(String(raw.id), id)
      eventTypes.push(toEventType(raw, id, `custom:${id.slice('event-type:'.length)}`, false, now))
    }
  }

  const selectedTypeOldIds = new Map([...selectedBuiltIns].map(([key, raw]) => [String(raw.id), key]))
  const rangeIds = new Map<string, string>()
  const eventRanges: EventRange[] = []
  for (const raw of input.eventRanges) {
    const oldTypeId = String(raw.eventTypeId)
    const eventTypeId = typeIds.get(oldTypeId)
    if (!eventTypeId) continue
    const builtInKey = selectedTypeOldIds.get(oldTypeId)
    if (!builtInKey && Object.values(BUILT_IN_EVENT_IDS).includes(eventTypeId as never)) continue
    const key = builtInKey
      ? seedEventTypes.find(seed => seed.eventType.key === builtInKey)?.ranges.find(seed => seed.range.order === asNumber(raw.order, 0))?.range.key || `range-${raw.order}`
      : String(raw.key || `range-${raw.order ?? raw.id}`)
    const id = builtInKey ? stableRangeId(builtInKey, key) : createEntityId('event-range')
    rangeIds.set(String(raw.id), id)
    eventRanges.push({
      id, eventTypeId, key,
      name: String(raw.name || ''),
      statusLabel: String(raw.statusLabel || raw.name || ''),
      color: String(raw.color || ''),
      dayOffsetStart: asNumber(raw.dayOffsetStart, 0),
      dayOffsetEnd: asNumber(raw.dayOffsetEnd, 0),
      useWorkdayOffset: Boolean(raw.useWorkdayOffset),
      order: asNumber(raw.order, 0),
    })
  }

  const eventRangeTasks: EventRangeTask[] = []
  for (const raw of input.rangeTasks) {
    const eventRangeId = rangeIds.get(String(raw.eventRangeId))
    if (!eventRangeId) continue
    const range = eventRanges.find(item => item.id === eventRangeId)!
    const eventType = eventTypes.find(item => item.id === range.eventTypeId)
    const key = String(raw.key || `task-${raw.order ?? raw.id}`)
    const id = eventType?.isBuiltIn
      ? stableRangeTaskId(eventType.key, range.key, key)
      : createEntityId('range-task')
    eventRangeTasks.push({
      id, eventRangeId, key,
      title: String(raw.title || ''),
      description: asOptionalString(raw.description),
      category: String(raw.category || 'other') as TaskCategory,
      weekdays: Array.isArray(raw.weekdays) ? raw.weekdays.filter(value => typeof value === 'number') as number[] : [],
      isHolidayDependent: Boolean(raw.isHolidayDependent),
      holidayRule: (raw.holidayRule || null) as EventRangeTask['holidayRule'],
      isOnceOnly: Boolean(raw.isOnceOnly),
      isActive: raw.isActive !== false,
      order: asNumber(raw.order, 0),
    })
  }

  const patientEvents: PatientEvent[] = []
  const patientEventIds = new Map<string, string>()
  const orphanRows: MigrationDraft['orphanRows'] = []
  for (const raw of input.patientEvents) {
    const patientId = patientIds.get(String(raw.patientId))
    if (!patientId) throw new Error(`旧库患者事件 ${String(raw.id)} 引用了不存在的患者 ${String(raw.patientId)}`)
    const eventTypeId = typeIds.get(String(raw.eventTypeId))
    if (!eventTypeId) {
      const patient = patients.find(item => item.id === patientId)!
      orphanRows.push({
        raw,
        patientId,
        orphan: {
          legacyPatientEventId: String(raw.id),
          patientName: patient.name,
          eventDate: String(raw.eventDate || ''),
          missingEventTypeId: String(raw.eventTypeId),
        },
      })
      continue
    }
    const patientEvent = toPatientEvent(raw, patientId, eventTypeId, now)
    patientEventIds.set(String(raw.id), patientEvent.id)
    patientEvents.push(patientEvent)
  }

  const tasks: Task[] = []
  const completions: OnceTaskCompletion[] = []
  for (const raw of input.tasks) {
    const patientId = patientIds.get(String(raw.patientId))
    if (!patientId) continue
    const resolved = resolveLegacyTaskSource(
      raw, patientId, patientEventIds, patientEvents, eventTypes, eventRanges, eventRangeTasks, rangeIds,
    )
    const sourceKey = resolved?.sourceKey || `historical-import:${String(raw.id)}`
    const date = String(raw.date || '')
    const completedAt = raw.completedAt as number | undefined
    const task: Task = {
      id: resolved ? deterministicLegacyTaskId(patientId, date, sourceKey) : createEntityId('task'), patientId,
      patientName: String(raw.patientName || patients.find(item => item.id === patientId)?.name || ''),
      date, title: String(raw.title || ''),
      description: asOptionalString(raw.description),
      category: String(raw.category || 'other') as TaskCategory,
      statusLabel: normalizeTaskStatusLabel(String(raw.statusLabel || '')),
      isCompleted: Boolean(raw.isCompleted), completedAt,
      createdAt: asNumber(raw.createdAt, now), updatedAt: asNumber(raw.updatedAt, now),
      order: asNumber(raw.order, 0), sourceKey,
      sourceEventId: resolved?.sourceEventId,
      sourceTemplateTaskId: resolved?.sourceTemplateTaskId,
      isOnceOnly: resolved?.isOnceOnly || false,
      isHistoricalImport: !resolved,
    }
    tasks.push(task)
    if (resolved?.isOnceOnly && task.isCompleted) {
      completions.push({
        id: onceCompletionId(patientId, sourceKey), patientId, sourceKey,
        sourceEventId: resolved.sourceEventId, sourceTemplateTaskId: resolved.sourceTemplateTaskId,
        completedDate: date, completedAt: completedAt || now,
      })
    }
  }
  return {
    patients, tasks, eventTypes, eventRanges, eventRangeTasks, patientEvents, completions, orphanRows,
    legacyPatientIds: Object.fromEntries(patientIds), legacyRangeIds: Object.fromEntries(rangeIds),
  }
}

function resolveLegacyTaskSource(
  raw: Raw,
  patientId: string,
  patientEventIds: Map<string, string>,
  patientEvents: PatientEvent[],
  eventTypes: EventType[],
  eventRanges: EventRange[],
  rangeTasks: EventRangeTask[],
  legacyRangeIds: Map<string, string>,
): { sourceKey: string; sourceEventId: string; sourceTemplateTaskId?: string; isOnceOnly: boolean } | null {
  const legacyKey = typeof raw.templateKey === 'string' ? raw.templateKey : ''
  const temporaryMatch = legacyKey.match(/^temp:(.+)$/)
  if (temporaryMatch) {
    const sourceEventId = patientEventIds.get(temporaryMatch[1])
    return sourceEventId ? { sourceKey: `temporary:${sourceEventId}`, sourceEventId, isOnceOnly: false } : null
  }

  const rangeMatch = legacyKey.match(/^range:([^:]+):(.+)$/)
  if (!rangeMatch) return null
  const eventRangeId = legacyRangeIds.get(rangeMatch[1])
  const range = eventRanges.find(item => item.id === eventRangeId)
  const template = rangeTasks.find(item => item.eventRangeId === eventRangeId && item.title === rangeMatch[2])
  const eventType = range && eventTypes.find(item => item.id === range.eventTypeId)
  if (!range || !template || !eventType) return null
  const sourceEventId = eventType.key === 'admission'
    ? `admission:${patientId}`
    : patientEvents.find(event => event.patientId === patientId && event.eventTypeId === eventType.id)?.id
  if (!sourceEventId) return null
  return {
    sourceKey: `${sourceEventId}:${template.id}`,
    sourceEventId,
    sourceTemplateTaskId: template.id,
    isOnceOnly: template.isOnceOnly,
  }
}

function deterministicLegacyTaskId(patientId: string, date: string, sourceKey: string): string {
  return `task:${encodeURIComponent(patientId)}:${date}:${encodeURIComponent(sourceKey)}`
}

function migrateLegacyCompletionLedger(draft: MigrationDraft): void {
  if (typeof localStorage === 'undefined') return
  const fallbackDate = new Date().toISOString().slice(0, 10)
  for (const [legacyPatientId, patientId] of Object.entries(draft.legacyPatientIds)) {
    let records: unknown
    try {
      records = JSON.parse(localStorage.getItem(`completedOnce:${legacyPatientId}`) || '[]')
    } catch {
      continue
    }
    if (!Array.isArray(records)) continue
    for (const item of records) {
      const legacyKey = typeof item === 'string'
        ? item
        : item && typeof item === 'object' && 'key' in item && typeof item.key === 'string' ? item.key : ''
      const match = legacyKey.match(/^range:([^:]+):(.+)$/)
      if (!match) continue
      const eventRangeId = draft.legacyRangeIds[match[1]]
      const template = draft.eventRangeTasks.find(task => task.eventRangeId === eventRangeId && task.title === match[2])
      const range = draft.eventRanges.find(candidate => candidate.id === eventRangeId)
      const type = range && draft.eventTypes.find(candidate => candidate.id === range.eventTypeId)
      if (!template || !type) continue
      const sourceEventId = type.key === 'admission'
        ? `admission:${patientId}`
        : draft.patientEvents.find(event => event.patientId === patientId && event.eventTypeId === type.id)?.id
      if (!sourceEventId) continue
      const sourceKey = `${sourceEventId}:${template.id}`
      const completedDate = item && typeof item === 'object' && 'completedDate' in item && typeof item.completedDate === 'string'
        ? item.completedDate
        : fallbackDate
      const completedAt = item && typeof item === 'object' && 'completedAt' in item && typeof item.completedAt === 'number'
        ? item.completedAt
        : Date.now()
      draft.completions.push({
        id: onceCompletionId(patientId, sourceKey), patientId, sourceKey, sourceEventId,
        sourceTemplateTaskId: template.id, completedDate, completedAt,
      })
    }
  }
}

async function commitDraft(draft: MigrationDraft, resolutions: Record<string, string>): Promise<void> {
  const now = Date.now()
  const repaired = draft.orphanRows.map(row =>
    toPatientEvent(row.raw, row.patientId, resolutions[row.orphan.legacyPatientEventId], now),
  )
  await db.transaction(
    'rw', [db.patients, db.tasks, db.eventTypes, db.eventRanges, db.eventRangeTasks,
      db.patientEvents, db.onceTaskCompletions, db.meta],
    async () => {
      await db.patients.bulkPut(draft.patients)
      await db.tasks.bulkPut(draft.tasks)
      await db.eventTypes.bulkPut(draft.eventTypes)
      await db.eventRanges.bulkPut(draft.eventRanges)
      await db.eventRangeTasks.bulkPut(draft.eventRangeTasks)
      await db.patientEvents.bulkPut([...draft.patientEvents, ...repaired])
      await db.onceTaskCompletions.bulkPut(draft.completions)
      await db.meta.put({ key: 'legacy-migration-complete', value: { completedAt: now }, updatedAt: now })
    },
  )
  await ensureSeedData()
  await repairDuplicatePatientEvents()
  await generateDailyTasks()
}

function toEventType(raw: Raw, id: string, key: string, isBuiltIn: boolean, now: number): EventType {
  return {
    id, key, isBuiltIn, name: String(raw.name || key), icon: String(raw.icon || '📋'),
    color: String(raw.color || 'border-l-gray-400 bg-gray-100'), isActive: raw.isActive !== false,
    order: asNumber(raw.order, 100), createdAt: asNumber(raw.createdAt, now), updatedAt: asNumber(raw.updatedAt, now),
  }
}

function toPatientEvent(raw: Raw, patientId: string, eventTypeId: string, now: number): PatientEvent {
  return {
    id: createEntityId('patient-event'), patientId, eventTypeId, eventDate: String(raw.eventDate || ''),
    customTitle: asOptionalString(raw.customTitle), customDescription: asOptionalString(raw.customDescription),
    customCategory: raw.customCategory as TaskCategory | undefined,
    createdAt: asNumber(raw.createdAt, now), updatedAt: asNumber(raw.updatedAt, now),
  }
}

function compareLegacyCandidate(a: Raw, b: Raw, patientEvents: Raw[]): number {
  const aReferenced = patientEvents.some(event => event.eventTypeId === a.id) ? 1 : 0
  const bReferenced = patientEvents.some(event => event.eventTypeId === b.id) ? 1 : 0
  if (aReferenced !== bReferenced) return bReferenced - aReferenced
  const updatedDiff = asNumber(b.updatedAt, 0) - asNumber(a.updatedAt, 0)
  if (updatedDiff) return updatedDiff
  return asNumber(a.id, 0) - asNumber(b.id, 0)
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}
