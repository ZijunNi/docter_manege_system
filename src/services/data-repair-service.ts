import { db } from '../db'
import type { PatientEvent } from '../types/event'
import type { OnceTaskCompletion, Task } from '../types/task'
import { deterministicTaskId, onceCompletionId } from '../utils/id'

/**
 * 非临时事件在当前业务模型中每位患者、每种类型只允许一个实例。
 * 保留最近更新的记录；时间相同时用稳定 ID 排序，保证所有设备结果一致。
 */
export function selectCanonicalPatientEvents(
  events: PatientEvent[],
  temporaryEventTypeId?: string,
): { canonical: PatientEvent[]; duplicates: Array<{ kept: PatientEvent; removed: PatientEvent }> } {
  const temporary: PatientEvent[] = []
  const grouped = new Map<string, PatientEvent[]>()

  for (const event of events) {
    if (event.eventTypeId === temporaryEventTypeId) {
      temporary.push(event)
      continue
    }
    const key = `${event.patientId}\u0000${event.eventTypeId}`
    const group = grouped.get(key) || []
    group.push(event)
    grouped.set(key, group)
  }

  const canonical = [...temporary]
  const duplicates: Array<{ kept: PatientEvent; removed: PatientEvent }> = []
  for (const group of grouped.values()) {
    group.sort(comparePatientEvents)
    const kept = group[0]
    canonical.push(kept)
    for (const removed of group.slice(1)) duplicates.push({ kept, removed })
  }
  return { canonical, duplicates }
}

/** 清理已存在的重复患者事件，并把任务和一次性完成状态迁移到保留事件。 */
export async function repairDuplicatePatientEvents(): Promise<number> {
  const [events, temporaryType] = await Promise.all([
    db.patientEvents.toArray(),
    db.eventTypes.where('key').equals('temporary').first(),
  ])
  const { duplicates } = selectCanonicalPatientEvents(events, temporaryType?.id)
  if (!duplicates.length) return 0

  await db.transaction(
    'rw', [db.patientEvents, db.tasks, db.onceTaskCompletions, db.meta],
    async () => {
      for (const { kept, removed } of duplicates) {
        await migrateTasks(removed, kept)
        await migrateCompletions(removed, kept)
        await db.patientEvents.delete(removed.id)
      }
      await db.meta.put({
        key: 'repair:duplicate-patient-events',
        value: { repairedAt: Date.now(), removedCount: duplicates.length },
        updatedAt: Date.now(),
      })
    },
  )
  return duplicates.length
}

async function migrateTasks(removed: PatientEvent, kept: PatientEvent): Promise<void> {
  const tasks = await db.tasks.where('sourceEventId').equals(removed.id).toArray()
  for (const task of tasks) {
    if (!task.sourceTemplateTaskId) {
      await db.tasks.delete(task.id)
      continue
    }
    const sourceKey = `${kept.id}:${task.sourceTemplateTaskId}`
    const id = deterministicTaskId(task.patientId, task.date, sourceKey)
    const current = await db.tasks.get(id)
    const merged = mergeTaskCompletion(task, current)
    await db.tasks.put({
      ...task,
      ...merged,
      id,
      sourceKey,
      sourceEventId: kept.id,
      updatedAt: Date.now(),
    })
    await db.tasks.delete(task.id)
  }
}

async function migrateCompletions(removed: PatientEvent, kept: PatientEvent): Promise<void> {
  const records = await db.onceTaskCompletions.where('sourceEventId').equals(removed.id).toArray()
  for (const record of records) {
    if (!record.sourceTemplateTaskId) {
      await db.onceTaskCompletions.delete(record.id)
      continue
    }
    const sourceKey = `${kept.id}:${record.sourceTemplateTaskId}`
    const id = onceCompletionId(record.patientId, sourceKey)
    const current = await db.onceTaskCompletions.get(id)
    const preferred = earlierCompletion(record, current)
    await db.onceTaskCompletions.put({
      ...preferred,
      id,
      sourceKey,
      sourceEventId: kept.id,
    })
    await db.onceTaskCompletions.delete(record.id)
  }
}

function comparePatientEvents(a: PatientEvent, b: PatientEvent): number {
  return b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id)
}

function mergeTaskCompletion(incoming: Task, current?: Task): Pick<Task, 'isCompleted' | 'completedAt' | 'createdAt'> {
  const isCompleted = incoming.isCompleted || Boolean(current?.isCompleted)
  const times = [incoming.completedAt, current?.completedAt].filter((value): value is number => typeof value === 'number')
  return {
    isCompleted,
    completedAt: isCompleted && times.length ? Math.min(...times) : undefined,
    createdAt: Math.min(incoming.createdAt, current?.createdAt ?? incoming.createdAt),
  }
}

function earlierCompletion(incoming: OnceTaskCompletion, current?: OnceTaskCompletion): OnceTaskCompletion {
  if (!current) return incoming
  if (incoming.completedDate !== current.completedDate) {
    return incoming.completedDate < current.completedDate ? incoming : current
  }
  return incoming.completedAt <= current.completedAt ? incoming : current
}
