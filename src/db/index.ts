import Dexie, { type EntityTable } from 'dexie'
import type { Patient } from '../types/patient'
import type { OnceTaskCompletion, Task } from '../types/task'
import type { EventType, EventRange, EventRangeTask, PatientEvent } from '../types/event'
import { seedEventTypes } from './seed-events'

export const STABLE_DB_NAME = 'ResidentScheduleDBStable'
export const LEGACY_DB_NAME = 'ResidentScheduleDB'

export interface DatabaseMeta {
  key: string
  value: unknown
  updatedAt: number
}

export interface ResidentScheduleDB extends Dexie {
  patients: EntityTable<Patient, 'id'>
  tasks: EntityTable<Task, 'id'>
  eventTypes: EntityTable<EventType, 'id'>
  eventRanges: EntityTable<EventRange, 'id'>
  eventRangeTasks: EntityTable<EventRangeTask, 'id'>
  patientEvents: EntityTable<PatientEvent, 'id'>
  onceTaskCompletions: EntityTable<OnceTaskCompletion, 'id'>
  meta: EntityTable<DatabaseMeta, 'key'>
}

const db = new Dexie(STABLE_DB_NAME) as ResidentScheduleDB

db.version(1).stores({
  patients: '&id, isArchived, admissionDate, updatedAt',
  tasks: '&id, patientId, date, [patientId+date], sourceKey, updatedAt',
  eventTypes: '&id, &key, isActive, order, updatedAt',
  eventRanges: '&id, eventTypeId, &[eventTypeId+key], order',
  eventRangeTasks: '&id, eventRangeId, &[eventRangeId+key], order',
  patientEvents: '&id, patientId, eventTypeId, [patientId+eventTypeId], eventDate, updatedAt',
  onceTaskCompletions: '&id, patientId, sourceKey, [patientId+completedDate]',
  meta: '&key',
})

db.version(2).stores({
  patients: '&id, isArchived, admissionDate, updatedAt',
  tasks: '&id, patientId, date, [patientId+date], sourceKey, sourceEventId, updatedAt',
  eventTypes: '&id, &key, isActive, order, updatedAt',
  eventRanges: '&id, eventTypeId, &[eventTypeId+key], order',
  eventRangeTasks: '&id, eventRangeId, &[eventRangeId+key], order',
  patientEvents: '&id, patientId, eventTypeId, [patientId+eventTypeId], eventDate, updatedAt',
  onceTaskCompletions: '&id, patientId, sourceKey, sourceEventId, [patientId+completedDate]',
  meta: '&key',
})

let seeding: Promise<void> | null = null

/** 只补充完全缺失的强制内置事件；不会覆盖用户或备份对内置模板的修改。 */
export async function ensureSeedData(): Promise<void> {
  if (seeding) return seeding

  seeding = db.transaction(
    'rw',
    db.eventTypes,
    db.eventRanges,
    db.eventRangeTasks,
    async () => {
      const now = Date.now()
      for (const seed of seedEventTypes) {
        if (await db.eventTypes.get(seed.eventType.id)) continue

        await db.eventTypes.add({ ...seed.eventType, createdAt: now, updatedAt: now })
        for (const rangeSeed of seed.ranges) {
          await db.eventRanges.add({ ...rangeSeed.range, eventTypeId: seed.eventType.id })
          await db.eventRangeTasks.bulkAdd(rangeSeed.tasks.map(task => ({
            ...task,
            eventRangeId: rangeSeed.range.id,
          })))
        }
      }
    },
  )

  try {
    await seeding
  } finally {
    seeding = null
  }
}

export { db }
