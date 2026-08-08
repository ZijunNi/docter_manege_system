import { db } from '../db'
import type { EventType, EventRange, EventRangeTask, PatientEvent } from '../types/event'

// ====== EventType CRUD ======

export async function getAllEventTypes(): Promise<EventType[]> {
  const all = await db.eventTypes.toArray()
  return all.sort((a, b) => a.order - b.order)
}

export async function getActiveEventTypes(): Promise<EventType[]> {
  const all = await db.eventTypes.toArray()
  return all
    .filter(et => et.isActive)
    .sort((a, b) => a.order - b.order)
}

export async function getEventTypeById(id: number): Promise<EventType | undefined> {
  return db.eventTypes.get(id)
}

export async function getEventTypeByKey(key: string): Promise<EventType | undefined> {
  return db.eventTypes.where('key').equals(key).first()
}

export async function createEventType(
  data: Omit<EventType, 'id' | 'createdAt' | 'updatedAt'>
): Promise<number> {
  const now = Date.now()
  const id = await db.eventTypes.add({
    ...data,
    createdAt: now,
    updatedAt: now,
  } as EventType)
  return id as number
}

export async function updateEventType(
  id: number,
  data: Partial<Omit<EventType, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  await db.eventTypes.update(id, {
    ...data,
    updatedAt: Date.now(),
  })
}

export async function deleteEventType(id: number): Promise<void> {
  const eventType = await db.eventTypes.get(id)
  if (!eventType || eventType.isBuiltIn) return

  await db.transaction(
    'rw',
    db.eventTypes,
    db.eventRanges,
    db.eventRangeTasks,
    db.patientEvents,
    async () => {
      // 级联删除所有 ranges
      const ranges = await db.eventRanges.where('eventTypeId').equals(id).toArray()
      for (const r of ranges) {
        // 级联删除 range 下的所有 tasks
        await db.eventRangeTasks.where('eventRangeId').equals(r.id!).delete()
      }
      await db.eventRanges.where('eventTypeId').equals(id).delete()
      // 删除关联的患者事件实例
      await db.patientEvents.where('eventTypeId').equals(id).delete()
      // 删除事件类型本身
      await db.eventTypes.delete(id)
    }
  )
}

// ====== EventRange CRUD ======

export async function getRangesByEventTypeId(eventTypeId: number): Promise<EventRange[]> {
  return db.eventRanges
    .where('eventTypeId')
    .equals(eventTypeId)
    .sortBy('order')
}

export async function createEventRange(
  data: Omit<EventRange, 'id'>
): Promise<number> {
  return await db.eventRanges.add(data as EventRange) as number
}

export async function updateEventRange(
  id: number,
  data: Partial<Omit<EventRange, 'id' | 'eventTypeId'>>
): Promise<void> {
  await db.eventRanges.update(id, data)
}

export async function deleteEventRange(id: number): Promise<void> {
  await db.transaction('rw', db.eventRanges, db.eventRangeTasks, async () => {
    await db.eventRangeTasks.where('eventRangeId').equals(id).delete()
    await db.eventRanges.delete(id)
  })
}

// ====== EventRangeTask CRUD ======

export async function getTasksByRangeId(eventRangeId: number): Promise<EventRangeTask[]> {
  return db.eventRangeTasks
    .where('eventRangeId')
    .equals(eventRangeId)
    .sortBy('order')
}

export async function createEventRangeTask(
  data: Omit<EventRangeTask, 'id'>
): Promise<number> {
  return await db.eventRangeTasks.add(data as EventRangeTask) as number
}

export async function updateEventRangeTask(
  id: number,
  data: Partial<Omit<EventRangeTask, 'id' | 'eventRangeId'>>
): Promise<void> {
  await db.eventRangeTasks.update(id, data)
}

export async function deleteEventRangeTask(id: number): Promise<void> {
  await db.eventRangeTasks.delete(id)
}

// ====== PatientEvent CRUD ======

export async function getEventsByPatientId(patientId: number): Promise<PatientEvent[]> {
  return db.patientEvents
    .where('patientId')
    .equals(patientId)
    .toArray()
}

export async function addPatientEvent(
  patientId: number,
  eventTypeId: number,
  eventDate: string
): Promise<number> {
  const now = Date.now()

  // 同一患者 + 同一事件类型只允许一个（先删旧的）
  const existing = await db.patientEvents
    .where('[patientId+eventTypeId]')
    .equals([patientId, eventTypeId])
    .first()
  if (existing) {
    await db.patientEvents.update(existing.id!, {
      eventDate,
      updatedAt: now,
    })
    return existing.id!
  }

  return await db.patientEvents.add({
    patientId,
    eventTypeId,
    eventDate,
    createdAt: now,
    updatedAt: now,
  } as PatientEvent) as number
}

export async function updatePatientEvent(
  id: number,
  eventDate: string
): Promise<void> {
  await db.patientEvents.update(id, {
    eventDate,
    updatedAt: Date.now(),
  })
}

export async function removePatientEvent(id: number): Promise<void> {
  await db.patientEvents.delete(id)
}

export async function removePatientEventByType(
  patientId: number,
  eventTypeId: number
): Promise<void> {
  await db.patientEvents
    .where('[patientId+eventTypeId]')
    .equals([patientId, eventTypeId])
    .delete()
}
