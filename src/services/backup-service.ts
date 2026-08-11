import { db, ensureSeedData, type DatabaseMeta } from '../db'
import type { EventRange, EventRangeTask, EventType, PatientEvent } from '../types/event'
import type { Patient } from '../types/patient'
import type { OnceTaskCompletion, Task } from '../types/task'
import { buildLegacyDraft, type MigrationDraft } from './migration-service'
import { createEntityId } from '../utils/id'
import { generateDailyTasks } from '../engine/task-generator'
import { seedEventTypes } from '../db/seed-events'
import { repairDuplicatePatientEvents } from './data-repair-service'

export interface BackupV3 {
  version: 3
  schemaVersion: 2
  exportId: string
  exportedAt: string
  patients: Patient[]
  tasks: Task[]
  eventTypes: EventType[]
  eventRanges: EventRange[]
  eventRangeTasks: EventRangeTask[]
  patientEvents: PatientEvent[]
  onceTaskCompletions: OnceTaskCompletion[]
}

export interface ImportPreview {
  sourceVersion: 1 | 2 | 3
  allowedModes: Array<'restore' | 'merge'>
  counts: Record<string, number>
  warnings: string[]
  orphans: MigrationDraft['orphanRows'][number]['orphan'][]
  payload: BackupV3 | MigrationDraft
}

export interface ImportResult {
  added: number
  updated: number
  skipped: number
  conflicts: number
}

export async function createBackupV3(): Promise<BackupV3> {
  await repairDuplicatePatientEvents()
  const [patients, tasks, eventTypes, eventRanges, eventRangeTasks, patientEvents, onceTaskCompletions] = await Promise.all([
    db.patients.toArray(), db.tasks.toArray(), db.eventTypes.toArray(), db.eventRanges.toArray(),
    db.eventRangeTasks.toArray(), db.patientEvents.toArray(), db.onceTaskCompletions.toArray(),
  ])
  const backup: BackupV3 = {
    version: 3,
    schemaVersion: 2,
    exportId: createEntityId('export'),
    exportedAt: new Date().toISOString(),
    patients, tasks, eventTypes, eventRanges, eventRangeTasks, patientEvents, onceTaskCompletions,
  }
  assertIntegrity(backup)
  return backup
}

export function parseBackup(text: string): ImportPreview {
  const raw = JSON.parse(text) as Record<string, unknown>
  const version = Number(raw.version || 1)
  if (version === 3) {
    const backup = raw as unknown as BackupV3
    assertV3Shape(backup)
    assertIntegrity(backup)
    return {
      sourceVersion: 3,
      allowedModes: ['restore', 'merge'],
      counts: backupCounts(backup),
      warnings: [],
      orphans: [],
      payload: backup,
    }
  }
  if (version !== 1 && version !== 2) throw new Error(`不支持的备份版本：${version}`)

  const arrays = (key: string): Record<string, unknown>[] => Array.isArray(raw[key]) ? raw[key] as Record<string, unknown>[] : []
  const draft = buildLegacyDraft({
    patients: arrays('patients'), tasks: arrays('tasks'), eventTypes: arrays('eventTypes'),
    eventRanges: arrays('eventRanges'), rangeTasks: arrays('eventRangeTasks'), patientEvents: arrays('patientEvents'),
  })
  const warnings = version === 1
    ? ['v1 备份不包含事件表，只能恢复患者和历史任务；不会推测手术或出院日期。']
    : []
  return {
    sourceVersion: version,
    allowedModes: ['restore'],
    counts: draftCounts(draft),
    warnings,
    orphans: draft.orphanRows.map(row => row.orphan),
    payload: draft,
  }
}

export async function importBackup(
  preview: ImportPreview,
  mode: 'restore' | 'merge',
  resolutions: Record<string, string> = {},
): Promise<ImportResult> {
  if (!preview.allowedModes.includes(mode)) throw new Error(`v${preview.sourceVersion} 备份只允许完整恢复`)
  if (preview.orphans.some(orphan => !resolutions[orphan.legacyPatientEventId])) {
    throw new Error('仍有悬空事件未完成映射，导入已取消')
  }
  const backup = preview.sourceVersion === 3
    ? preview.payload as BackupV3
    : legacyDraftToBackup(preview.payload as MigrationDraft, resolutions)
  const result = mode === 'restore' ? await restoreBackup(backup) : await mergeBackup(backup)
  await repairDuplicatePatientEvents()
  await generateDailyTasks()
  return result
}

async function restoreBackup(backup: BackupV3): Promise<ImportResult> {
  assertIntegrity(backup)
  await db.transaction(
    'rw', [db.patients, db.tasks, db.eventTypes, db.eventRanges, db.eventRangeTasks,
      db.patientEvents, db.onceTaskCompletions, db.meta],
    async () => {
      await Promise.all([
        db.patients.clear(), db.tasks.clear(), db.eventTypes.clear(), db.eventRanges.clear(),
        db.eventRangeTasks.clear(), db.patientEvents.clear(), db.onceTaskCompletions.clear(), db.meta.clear(),
      ])
      await db.patients.bulkPut(backup.patients)
      await db.tasks.bulkPut(backup.tasks)
      await db.eventTypes.bulkPut(backup.eventTypes)
      await db.eventRanges.bulkPut(backup.eventRanges)
      await db.eventRangeTasks.bulkPut(backup.eventRangeTasks)
      await db.patientEvents.bulkPut(backup.patientEvents)
      await db.onceTaskCompletions.bulkPut(backup.onceTaskCompletions)
      await db.meta.put(importMeta(backup))
    },
  )
  await ensureSeedData()
  return { added: Object.values(backupCounts(backup)).reduce((a, b) => a + b, 0), updated: 0, skipped: 0, conflicts: 0 }
}

async function mergeBackup(backup: BackupV3): Promise<ImportResult> {
  assertIntegrity(backup)
  let added = 0
  let updated = 0
  let skipped = 0
  let conflicts = 0
  await db.transaction(
    'rw', [db.patients, db.tasks, db.eventTypes, db.eventRanges, db.eventRangeTasks,
      db.patientEvents, db.onceTaskCompletions, db.meta],
    async () => {
      const mergeNewer = async <T extends { id: string; updatedAt?: number }>(row: T, current: T | undefined, put: () => Promise<unknown>) => {
        if (!current) { await put(); added++; return }
        if ((row.updatedAt || 0) > (current.updatedAt || 0)) { await put(); updated++; return }
        skipped++
      }
      for (const patient of backup.patients) await mergeNewer(patient, await db.patients.get(patient.id), () => db.patients.put(patient))

      const customTypes = backup.eventTypes.filter(type => !type.isBuiltIn)
      for (const type of customTypes) {
        const current = await db.eventTypes.get(type.id)
        const incomingWins = !current || type.updatedAt > current.updatedAt
        const ranges = backup.eventRanges.filter(range => range.eventTypeId === type.id)
        const rangeIds = new Set(ranges.map(range => range.id))
        const templates = backup.eventRangeTasks.filter(task => rangeIds.has(task.eventRangeId))
        if (!incomingWins) {
          skipped += 1 + ranges.length + templates.length
          continue
        }
        if (current) {
          const oldRanges = await db.eventRanges.where('eventTypeId').equals(type.id).toArray()
          for (const range of oldRanges) await db.eventRangeTasks.where('eventRangeId').equals(range.id).delete()
          await db.eventRanges.where('eventTypeId').equals(type.id).delete()
          updated += 1 + ranges.length + templates.length
        } else {
          added += 1 + ranges.length + templates.length
        }
        await db.eventTypes.put(type)
        await db.eventRanges.bulkPut(ranges)
        await db.eventRangeTasks.bulkPut(templates)
      }
      for (const event of backup.patientEvents) await mergeNewer(event, await db.patientEvents.get(event.id), () => db.patientEvents.put(event))

      for (const completion of backup.onceTaskCompletions) {
        const current = await db.onceTaskCompletions.get(completion.id)
        if (!current) { await db.onceTaskCompletions.put(completion); added++; continue }
        if (completion.completedAt < current.completedAt) {
          await db.onceTaskCompletions.put(completion)
          updated++
          conflicts++
        } else skipped++
      }
      for (const task of backup.tasks.filter(task => task.isHistoricalImport)) {
        const current = await db.tasks.get(task.id)
        if (!current) { await db.tasks.put(task); added++; continue }
        if (task.isCompleted && !current.isCompleted) {
          await db.tasks.put({ ...current, isCompleted: true, completedAt: current.completedAt || task.completedAt, updatedAt: Date.now() })
          updated++
          conflicts++
        } else skipped++
      }
      await db.meta.put(importMeta(backup))
    },
  )
  return { added, updated, skipped, conflicts }
}

export function assertIntegrity(backup: BackupV3): void {
  const patientIds = new Set(backup.patients.map(row => row.id))
  const typeIds = new Set(backup.eventTypes.map(row => row.id))
  const rangeIds = new Set(backup.eventRanges.map(row => row.id))
  const taskTemplateIds = new Set(backup.eventRangeTasks.map(row => row.id))
  const patientEventIds = new Set(backup.patientEvents.map(row => row.id))
  const errors: string[] = []
  for (const row of backup.eventRanges) if (!typeIds.has(row.eventTypeId)) errors.push(`范围 ${row.id} 引用了不存在的事件类型 ${row.eventTypeId}`)
  for (const row of backup.eventRangeTasks) if (!rangeIds.has(row.eventRangeId)) errors.push(`模板任务 ${row.id} 引用了不存在的范围 ${row.eventRangeId}`)
  for (const row of backup.patientEvents) {
    if (!patientIds.has(row.patientId)) errors.push(`患者事件 ${row.id} 引用了不存在的患者 ${row.patientId}`)
    if (!typeIds.has(row.eventTypeId)) errors.push(`患者事件 ${row.id} 引用了不存在的事件类型 ${row.eventTypeId}`)
  }
  for (const row of backup.tasks) {
    if (!patientIds.has(row.patientId)) errors.push(`任务 ${row.id} 引用了不存在的患者 ${row.patientId}`)
    if (row.sourceTemplateTaskId && !taskTemplateIds.has(row.sourceTemplateTaskId) && !row.isHistoricalImport) errors.push(`任务 ${row.id} 引用了不存在的模板任务`)
    if (row.sourceEventId && !row.sourceEventId.startsWith('admission:') && !patientEventIds.has(row.sourceEventId) && !row.isHistoricalImport) errors.push(`任务 ${row.id} 引用了不存在的患者事件`)
  }
  for (const row of backup.onceTaskCompletions) {
    if (!patientIds.has(row.patientId)) errors.push(`完成记录 ${row.id} 引用了不存在的患者`)
    if (row.sourceTemplateTaskId && !taskTemplateIds.has(row.sourceTemplateTaskId)) errors.push(`完成记录 ${row.id} 引用了不存在的模板任务`)
    if (row.sourceEventId && !row.sourceEventId.startsWith('admission:') && !patientEventIds.has(row.sourceEventId)) errors.push(`完成记录 ${row.id} 引用了不存在的患者事件`)
  }
  if (errors.length) throw new Error(`引用完整性检查失败：\n${errors.slice(0, 10).join('\n')}`)
}

function legacyDraftToBackup(draft: MigrationDraft, resolutions: Record<string, string>): BackupV3 {
  const repaired = draft.orphanRows.map(row => ({
    id: createEntityId('patient-event'), patientId: row.patientId,
    eventTypeId: resolutions[row.orphan.legacyPatientEventId], eventDate: String(row.raw.eventDate || ''),
    customTitle: typeof row.raw.customTitle === 'string' ? row.raw.customTitle : undefined,
    customDescription: typeof row.raw.customDescription === 'string' ? row.raw.customDescription : undefined,
    createdAt: typeof row.raw.createdAt === 'number' ? row.raw.createdAt : Date.now(),
    updatedAt: typeof row.raw.updatedAt === 'number' ? row.raw.updatedAt : Date.now(),
  }))
  const backup: BackupV3 = {
    version: 3, schemaVersion: 2, exportId: createEntityId('legacy-import'), exportedAt: new Date().toISOString(),
    patients: draft.patients, tasks: draft.tasks, eventTypes: draft.eventTypes,
    eventRanges: draft.eventRanges, eventRangeTasks: draft.eventRangeTasks,
    patientEvents: [...draft.patientEvents, ...repaired], onceTaskCompletions: draft.completions,
  }
  const now = Date.now()
  for (const seed of seedEventTypes) {
    if (backup.eventTypes.some(type => type.id === seed.eventType.id)) continue
    backup.eventTypes.push({ ...seed.eventType, createdAt: now, updatedAt: now })
    for (const rangeSeed of seed.ranges) {
      backup.eventRanges.push({ ...rangeSeed.range, eventTypeId: seed.eventType.id })
      backup.eventRangeTasks.push(...rangeSeed.tasks.map(task => ({ ...task, eventRangeId: rangeSeed.range.id })))
    }
  }
  return backup
}

function assertV3Shape(backup: BackupV3): void {
  if (backup.version !== 3 || typeof backup.exportId !== 'string' || typeof backup.schemaVersion !== 'number') throw new Error('无效的 v3 备份元数据')
  for (const key of ['patients', 'tasks', 'eventTypes', 'eventRanges', 'eventRangeTasks', 'patientEvents', 'onceTaskCompletions'] as const) {
    if (!Array.isArray(backup[key])) throw new Error(`v3 备份缺少 ${key}`)
    if (backup[key].some(row => typeof row.id !== 'string')) throw new Error(`v3 备份的 ${key} 包含非字符串 ID`)
  }
}

function backupCounts(backup: BackupV3): Record<string, number> {
  return {
    患者: backup.patients.length, 任务: backup.tasks.length, 事件类型: backup.eventTypes.length,
    事件范围: backup.eventRanges.length, 模板任务: backup.eventRangeTasks.length,
    患者事件: backup.patientEvents.length, 一次性完成记录: backup.onceTaskCompletions.length,
  }
}

function draftCounts(draft: MigrationDraft): Record<string, number> {
  return {
    患者: draft.patients.length, 历史任务: draft.tasks.length, 事件类型: draft.eventTypes.length,
    事件范围: draft.eventRanges.length, 模板任务: draft.eventRangeTasks.length,
    患者事件: draft.patientEvents.length + draft.orphanRows.length,
  }
}

function importMeta(backup: BackupV3): DatabaseMeta {
  return { key: `import:${backup.exportId}`, value: { importedAt: Date.now() }, updatedAt: Date.now() }
}
