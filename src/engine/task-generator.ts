import { db } from '../db'
import type { Patient } from '../types/patient'
import type { OnceTaskCompletion, Task } from '../types/task'
import type { ActiveStatus, EventRange, EventRangeTask, EventType, PatientEvent } from '../types/event'
import { getActiveStatuses } from './state-machine'
import { today, getWeekday } from '../utils/date'
import { isDayBeforeHoliday, isNonWorkday, isWorkday } from './holiday-utils'
import { deterministicTaskId, onceCompletionId } from '../utils/id'
import { TaskCategory } from '../types/enums'
import { selectCanonicalPatientEvents } from '../services/data-repair-service'
import { normalizeTaskStatusLabel } from '../utils/task-compat'

let refreshLock: Promise<void> | null = null

export async function generateDailyTasks(targetDate?: string): Promise<void> {
  if (refreshLock) return refreshLock
  refreshLock = (async () => {
    const date = targetDate || today()
    const [patients, eventTypes, eventRanges, rangeTasks, patientEvents] = await Promise.all([
      db.patients.where('isArchived').equals(0).toArray(),
      db.eventTypes.toArray(),
      db.eventRanges.toArray(),
      db.eventRangeTasks.toArray(),
      db.patientEvents.toArray(),
    ])
    const activeTypes = eventTypes.filter(type => type.isActive)
    for (const patient of patients) {
      await generateTasksForPatientInternal(
        patient,
        patientEvents.filter(event => event.patientId === patient.id),
        activeTypes,
        eventRanges,
        rangeTasks,
        date,
      )
    }
  })()
  try {
    await refreshLock
  } finally {
    refreshLock = null
  }
}

export async function generateTasksForPatient(patient: Patient, targetDate?: string): Promise<Task[]> {
  const date = targetDate || today()
  const [eventTypes, eventRanges, rangeTasks, patientEvents] = await Promise.all([
    db.eventTypes.toArray(),
    db.eventRanges.toArray(),
    db.eventRangeTasks.toArray(),
    db.patientEvents.where('patientId').equals(patient.id).toArray(),
  ])
  return generateTasksForPatientInternal(
    patient,
    patientEvents,
    eventTypes.filter(type => type.isActive),
    eventRanges,
    rangeTasks,
    date,
  )
}

async function generateTasksForPatientInternal(
  patient: Patient,
  patientEvents: PatientEvent[],
  activeEventTypes: EventType[],
  eventRanges: EventRange[],
  allRangeTasks: EventRangeTask[],
  date: string,
): Promise<Task[]> {
  const temporaryType = activeEventTypes.find(type => type.key === 'temporary')
  const canonicalEvents = selectCanonicalPatientEvents(patientEvents, temporaryType?.id).canonical
  const statuses = getActiveStatuses(patient, canonicalEvents, activeEventTypes, eventRanges, date)
  const [existingTasks, completionRecords] = await Promise.all([
    db.tasks.where('[patientId+date]').equals([patient.id, date]).toArray(),
    db.onceTaskCompletions.where('patientId').equals(patient.id).toArray(),
  ])
  const existingById = new Map(existingTasks.map(task => [task.id, task]))
  const completedBeforeDate = new Set(
    completionRecords
      .filter(record => record.completedDate < date)
      .map(record => record.sourceKey),
  )
  const completedToday = new Map(
    completionRecords
      .filter(record => record.completedDate === date)
      .map(record => [record.sourceKey, record]),
  )

  const now = Date.now()
  const expected: Task[] = matchRangeTasks(date, statuses, allRangeTasks, completedBeforeDate)
    .map(({ task, status, order }) => {
      const sourceKey = `${status.sourceEventId}:${task.id}`
      const id = deterministicTaskId(patient.id, date, sourceKey)
      const existing = existingById.get(id)
      const completion = completedToday.get(sourceKey)
      const isCompleted = existing?.isCompleted ?? Boolean(completion)
      return {
        id,
        patientId: patient.id,
        patientName: patient.name,
        date,
        title: task.title,
        description: task.description,
        category: task.category,
        statusLabel: status.statusLabel,
        isCompleted,
        completedAt: isCompleted ? existing?.completedAt || completion?.completedAt || now : undefined,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        order,
        sourceKey,
        sourceEventId: status.sourceEventId,
        sourceTemplateTaskId: task.id,
        isOnceOnly: task.isOnceOnly,
      }
    })

  if (temporaryType) {
    const temporaryEvents = patientEvents.filter(event =>
      event.eventTypeId === temporaryType.id && event.eventDate === date && event.customTitle,
    )
    for (const event of temporaryEvents) {
      const sourceKey = `temporary:${event.id}`
      const id = deterministicTaskId(patient.id, date, sourceKey)
      const existing = existingById.get(id)
      expected.push({
        id,
        patientId: patient.id,
        patientName: patient.name,
        date,
        title: event.customTitle!,
        description: event.customDescription,
        category: event.customCategory || TaskCategory.TEMPORARY,
        statusLabel: '临时',
        isCompleted: existing?.isCompleted || false,
        completedAt: existing?.isCompleted ? existing.completedAt : undefined,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        order: -1,
        sourceKey,
        sourceEventId: event.id,
        isOnceOnly: false,
      })
    }
  }

  // 早期字符串 ID 迁移把旧版已生成任务全部当作历史任务保留，导致与新任务成对显示。
  // 仅在标题、类别、兼容归一化后的状态分组和描述都唯一匹配时吸收完成状态，
  // 无法确定来源的历史任务继续保留。
  const expectedBySignature = new Map<string, Task[]>()
  for (const task of expected) {
    const signature = taskSignature(task)
    const matches = expectedBySignature.get(signature) || []
    matches.push(task)
    expectedBySignature.set(signature, matches)
  }
  const absorbedHistoricalIds = new Set<string>()
  const completionUpserts: OnceTaskCompletion[] = []
  for (const historical of existingTasks.filter(task => task.isHistoricalImport)) {
    const matches = expectedBySignature.get(taskSignature(historical)) || []
    if (matches.length !== 1) continue
    const generated = matches[0]
    absorbedHistoricalIds.add(historical.id)
    if (historical.isCompleted) {
      generated.isCompleted = true
      generated.completedAt = earliestTime(generated.completedAt, historical.completedAt) || now
      generated.createdAt = Math.min(generated.createdAt, historical.createdAt)
      if (generated.isOnceOnly) {
        completionUpserts.push({
          id: onceCompletionId(patient.id, generated.sourceKey),
          patientId: patient.id,
          sourceKey: generated.sourceKey,
          sourceEventId: generated.sourceEventId,
          sourceTemplateTaskId: generated.sourceTemplateTaskId,
          completedDate: date,
          completedAt: generated.completedAt,
        })
      }
    }
  }

  const expectedIds = new Set(expected.map(task => task.id))
  const obsoleteIds = existingTasks
    .filter(task => absorbedHistoricalIds.has(task.id) || (!expectedIds.has(task.id) && !task.isHistoricalImport))
    .map(task => task.id)

  await db.transaction('rw', db.tasks, db.onceTaskCompletions, async () => {
    if (expected.length) await db.tasks.bulkPut(expected)
    if (completionUpserts.length) await db.onceTaskCompletions.bulkPut(completionUpserts)
    if (obsoleteIds.length) await db.tasks.bulkDelete(obsoleteIds)
  })
  return expected.sort((a, b) => a.order - b.order)
}

function taskSignature(task: Pick<Task, 'title' | 'category' | 'statusLabel' | 'description'>): string {
  return JSON.stringify([
    task.title,
    task.category,
    normalizeTaskStatusLabel(task.statusLabel),
    task.description || '',
  ])
}

function earliestTime(a?: number, b?: number): number | undefined {
  const values = [a, b].filter((value): value is number => typeof value === 'number')
  return values.length ? Math.min(...values) : undefined
}

function matchRangeTasks(
  date: string,
  statuses: ActiveStatus[],
  allRangeTasks: EventRangeTask[],
  completedBeforeDate: Set<string>,
): Array<{ task: EventRangeTask; status: ActiveStatus; order: number }> {
  const weekday = getWeekday(date)
  const results: Array<{ task: EventRangeTask; status: ActiveStatus; order: number }> = []
  const seen = new Set<string>()

  for (const status of statuses) {
    for (const task of allRangeTasks.filter(item => item.eventRangeId === status.eventRangeId && item.isActive)) {
      const sourceKey = `${status.sourceEventId}:${task.id}`
      if (task.isOnceOnly && completedBeforeDate.has(sourceKey)) continue
      if (task.weekdays.length && !task.weekdays.includes(weekday)) continue
      if (task.isHolidayDependent && task.holidayRule) {
        if (task.holidayRule === 'before_holiday' && !isDayBeforeHoliday(date)) continue
        if (task.holidayRule === 'non_workday' && !isNonWorkday(date)) continue
        if (task.holidayRule === 'only_workday' && !isWorkday(date)) continue
      }
      if (seen.has(sourceKey)) continue
      seen.add(sourceKey)
      results.push({ task, status, order: status.priority * 100 + task.order })
    }
  }
  return results.sort((a, b) => a.order - b.order)
}
