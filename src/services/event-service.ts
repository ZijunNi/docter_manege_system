import { db } from '../db'
import type { EventType, EventRange, EventRangeTask, PatientEvent } from '../types/event'
import { createEntityId } from '../utils/id'

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

export async function getEventTypeById(id: string): Promise<EventType | undefined> {
  return db.eventTypes.get(id)
}

export async function getEventTypeByKey(key: string): Promise<EventType | undefined> {
  return db.eventTypes.where('key').equals(key).first()
}

export async function createEventType(
  data: Omit<EventType, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const now = Date.now()
  const id = createEntityId('event-type')
  await db.eventTypes.add({
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  } as EventType)
  return id
}

export async function updateEventType(
  id: string,
  data: Partial<Omit<EventType, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  await db.eventTypes.update(id, {
    ...data,
    updatedAt: Date.now(),
  })
}

export async function deleteEventType(id: string): Promise<void> {
  const eventType = await db.eventTypes.get(id)
  if (!eventType || eventType.isBuiltIn) return

  await db.transaction(
    'rw',
    [db.eventTypes, db.eventRanges, db.eventRangeTasks, db.patientEvents, db.tasks, db.onceTaskCompletions],
    async () => {
      // 级联删除所有 ranges
      const ranges = await db.eventRanges.where('eventTypeId').equals(id).toArray()
      for (const r of ranges) {
        // 级联删除 range 下的所有 tasks
        await db.eventRangeTasks.where('eventRangeId').equals(r.id!).delete()
      }
      await db.eventRanges.where('eventTypeId').equals(id).delete()
      // 删除关联的患者事件实例
      const patientEvents = await db.patientEvents.where('eventTypeId').equals(id).toArray()
      for (const event of patientEvents) {
        await db.tasks.where('sourceEventId').equals(event.id).delete()
        await db.onceTaskCompletions.where('sourceEventId').equals(event.id).delete()
      }
      await db.patientEvents.where('eventTypeId').equals(id).delete()
      // 删除事件类型本身
      await db.eventTypes.delete(id)
    }
  )
}

// ====== EventRange CRUD ======

export async function getRangesByEventTypeId(eventTypeId: string): Promise<EventRange[]> {
  return db.eventRanges
    .where('eventTypeId')
    .equals(eventTypeId)
    .sortBy('order')
}

export async function createEventRange(
  data: Omit<EventRange, 'id'>
): Promise<string> {
  const id = createEntityId('event-range')
  await db.eventRanges.add({ ...data, id } as EventRange)
  return id
}

export async function updateEventRange(
  id: string,
  data: Partial<Omit<EventRange, 'id' | 'eventTypeId'>>
): Promise<void> {
  await db.eventRanges.update(id, data)
}

export async function deleteEventRange(id: string): Promise<void> {
  await db.transaction('rw', db.eventRanges, db.eventRangeTasks, async () => {
    await db.eventRangeTasks.where('eventRangeId').equals(id).delete()
    await db.eventRanges.delete(id)
  })
}

// ====== EventRangeTask CRUD ======

export async function getTasksByRangeId(eventRangeId: string): Promise<EventRangeTask[]> {
  return db.eventRangeTasks
    .where('eventRangeId')
    .equals(eventRangeId)
    .sortBy('order')
}

export async function createEventRangeTask(
  data: Omit<EventRangeTask, 'id'>
): Promise<string> {
  const id = createEntityId('range-task')
  await db.eventRangeTasks.add({ ...data, id } as EventRangeTask)
  return id
}

export async function updateEventRangeTask(
  id: string,
  data: Partial<Omit<EventRangeTask, 'id' | 'eventRangeId'>>
): Promise<void> {
  await db.eventRangeTasks.update(id, data)
}

export async function deleteEventRangeTask(id: string): Promise<void> {
  await db.eventRangeTasks.delete(id)
}

// ====== PatientEvent CRUD ======

export async function getEventsByPatientId(patientId: string): Promise<PatientEvent[]> {
  return db.patientEvents
    .where('patientId')
    .equals(patientId)
    .toArray()
}

export async function addPatientEvent(
  patientId: string,
  eventTypeId: string,
  eventDate: string,
  extra?: { customTitle?: string; customDescription?: string; customCategory?: import('../types/enums').TaskCategory }
): Promise<string> {
  const now = Date.now()

  // 同一患者 + 同一事件类型只允许一个（先删旧的）
  const existing = await db.patientEvents
    .where('[patientId+eventTypeId]')
    .equals([patientId, eventTypeId])
    .first()
  if (existing) {
    await db.patientEvents.update(existing.id!, {
      eventDate,
      customTitle: extra?.customTitle,
      customDescription: extra?.customDescription,
      customCategory: extra?.customCategory,
      updatedAt: now,
    })
    return existing.id!
  }

  const id = createEntityId('patient-event')
  await db.patientEvents.add({
    id,
    patientId,
    eventTypeId,
    eventDate,
    customTitle: extra?.customTitle,
    customDescription: extra?.customDescription,
    customCategory: extra?.customCategory,
    createdAt: now,
    updatedAt: now,
  } as PatientEvent)
  return id
}

export async function updatePatientEvent(
  id: string,
  eventDate: string
): Promise<void> {
  await db.patientEvents.update(id, {
    eventDate,
    updatedAt: Date.now(),
  })
}

export async function removePatientEvent(id: string): Promise<void> {
  await db.transaction('rw', db.patientEvents, db.tasks, db.onceTaskCompletions, async () => {
    await db.patientEvents.delete(id)
    await db.tasks.where('sourceEventId').equals(id).delete()
    await db.onceTaskCompletions.where('sourceEventId').equals(id).delete()
  })
}

export async function removePatientEventByType(
  patientId: string,
  eventTypeId: string
): Promise<void> {
  const events = await db.patientEvents
    .where('[patientId+eventTypeId]')
    .equals([patientId, eventTypeId])
    .toArray()
  for (const event of events) await removePatientEvent(event.id)
}

/**
 * 为患者添加一个临时待办（自动查找 temporary 事件类型）
 */
export async function addTemporaryTask(
  patientId: string,
  eventDate: string,
  title: string,
  description?: string,
  category?: import('../types/enums').TaskCategory
): Promise<string> {
  const tempType = await db.eventTypes.where('key').equals('temporary').first()
  if (!tempType) throw new Error('临时待办事件类型未找到，请刷新页面后重试')

  // 临时待办允许多条共存，直接插入，不经 addPatientEvent（那条有 update-if-exists 逻辑）
  const now = Date.now()
  const id = createEntityId('patient-event')
  await db.patientEvents.add({
    id,
    patientId,
    eventTypeId: tempType.id!,
    eventDate,
    customTitle: title,
    customDescription: description,
    customCategory: category,
    createdAt: now,
    updatedAt: now,
  } as import('../types/event').PatientEvent)
  return id
}

/**
 * 删除指定 PatientEvent 及其生成的临时任务
 */
export async function removeTemporaryTask(patientEventId: string): Promise<void> {
  await removePatientEvent(patientEventId)
}
