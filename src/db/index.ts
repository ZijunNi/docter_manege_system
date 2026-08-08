import Dexie, { type EntityTable } from 'dexie'
import type { Patient } from '../types/patient'
import type { Task } from '../types/task'
import type { EventType, EventRange, EventRangeTask, PatientEvent } from '../types/event'
import { seedEventTypes } from './seed-events'

interface ResidentScheduleDB extends Dexie {
  patients: EntityTable<Patient, 'id'>
  tasks: EntityTable<Task, 'id'>
  eventTypes: EntityTable<EventType, 'id'>
  eventRanges: EntityTable<EventRange, 'id'>
  eventRangeTasks: EntityTable<EventRangeTask, 'id'>
  patientEvents: EntityTable<PatientEvent, 'id'>
}

const db = new Dexie('ResidentScheduleDB') as ResidentScheduleDB

/** 插入内置事件模板（在 upgrade 中复用） */
async function seedBuiltInEventTypes(tx: { table: (name: string) => { add: (item: unknown) => Promise<number> } }) {
  const now = Date.now()
  for (const seed of seedEventTypes) {
    const eventTypeId = await tx.table('eventTypes').add({
      ...seed.eventType,
      createdAt: now,
      updatedAt: now,
    })
    for (const rangeSeed of seed.ranges) {
      const rangeId = await tx.table('eventRanges').add({
        ...rangeSeed.range,
        eventTypeId,
      })
      for (const taskSeed of rangeSeed.tasks) {
        await tx.table('eventRangeTasks').add({
          ...taskSeed,
          eventRangeId: rangeId,
        })
      }
    }
  }
}

/**
 * 确保数据库中已有内置事件模板。
 * 在应用启动时调用，覆盖两种场景：
 * - 全新安装（v7 直接创建，upgrade 未运行）
 * - v6→v7 迁移后数据已存在（幂等，count > 0 则跳过）
 */
export async function ensureSeedData(): Promise<void> {
  const count = await db.eventTypes.count()
  if (count > 0) return  // 已播种，跳过

  // 全新数据库：插入内置事件模板
  const now = Date.now()
  for (const seed of seedEventTypes) {
    const eventTypeId = await db.eventTypes.add({
      ...seed.eventType,
      createdAt: now,
      updatedAt: now,
    }) as number
    for (const rangeSeed of seed.ranges) {
      const rangeId = await db.eventRanges.add({
        ...rangeSeed.range,
        eventTypeId,
      }) as number
      for (const taskSeed of rangeSeed.tasks) {
        await db.eventRangeTasks.add({
          ...taskSeed,
          eventRangeId: rangeId,
        })
      }
    }
  }
}

// v6: 旧版 schema（仅保留以支持升级路径）
db.version(6).stores({
  patients: '++id, status, isArchived, admissionDate',
  tasks: '++id, patientId, date, status, [patientId+date]',
  taskTemplates: '++id, key, patientStatus, weekday, surgeryPhase',
})

// v7: 新事件驱动 schema
db.version(7).stores({
  patients: '++id, isArchived, admissionDate',
  tasks: '++id, patientId, date, [patientId+date]',
  eventTypes: '++id, key',
  eventRanges: '++id, eventTypeId',
  eventRangeTasks: '++id, eventRangeId',
  patientEvents: '++id, patientId, eventTypeId, [patientId+eventTypeId]',
}).upgrade(async tx => {
  const now = Date.now()

  // 1. 插入内置事件模板
  await seedBuiltInEventTypes(tx)

  // 2. 查找内置事件类型 ID（用于迁移旧患者数据）
  const surgeryType = await tx.table('eventTypes').where('key').equals('surgery').first()
  const dischargeType = await tx.table('eventTypes').where('key').equals('discharge').first()

  // 3. 迁移旧患者数据：将 surgery/discharge 转为 PatientEvent
  const allPatients = await tx.table('patients').toArray()
  for (const p of allPatients) {
    // 使用 Dexie 的原始表访问来读写包含旧字段的记录
    const rawPatient = p as Record<string, unknown>

    // 手术 → PatientEvent
    if (surgeryType && rawPatient['hasSurgery'] && rawPatient['surgeryDate']) {
      await tx.table('patientEvents').add({
        patientId: p.id,
        eventTypeId: surgeryType.id,
        eventDate: rawPatient['surgeryDate'] as string,
        createdAt: now,
        updatedAt: now,
      })
    }

    // 出院 → PatientEvent
    if (dischargeType && rawPatient['dischargeDate']) {
      await tx.table('patientEvents').add({
        patientId: p.id,
        eventTypeId: dischargeType.id,
        eventDate: rawPatient['dischargeDate'] as string,
        createdAt: now,
        updatedAt: now,
      })
    }

    // 清理旧字段（设为 undefined 以从对象存储中移除）
    await tx.table('patients').update(p.id!, {
      hasSurgery: undefined,
      surgeryDate: undefined,
      preDischargeDate: undefined,
      dischargeDate: undefined,
      status: undefined,
    } as unknown as Partial<Patient>)
  }

  // 4. 更新旧 tasks：patientStatus → statusLabel
  const allTasks = await tx.table('tasks').toArray()
  for (const t of allTasks) {
    const rawTask = t as Record<string, unknown>
    await tx.table('tasks').update(t.id!, {
      statusLabel: (rawTask['patientStatus'] as string) || '',
      patientStatus: undefined,
      status: undefined,
    } as unknown as Partial<Task>)
  }
})

export { db }
export type { ResidentScheduleDB }
