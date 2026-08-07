import Dexie, { type EntityTable } from 'dexie'
import type { Patient } from '../types/patient'
import type { Task } from '../types/task'
import type { TaskTemplate } from '../types/task-template'
import { seedTaskTemplates } from './seed'

interface ResidentScheduleDB extends Dexie {
  patients: EntityTable<Patient, 'id'>
  tasks: EntityTable<Task, 'id'>
  taskTemplates: EntityTable<TaskTemplate, 'id'>
}

const db = new Dexie('ResidentScheduleDB') as ResidentScheduleDB

db.version(2).stores({
  patients: '++id, status, isArchived, admissionDate',
  tasks: '++id, patientId, date, status, [patientId+date]',
  taskTemplates: '++id, key, patientStatus, weekday, surgeryPhase',
}).upgrade(async tx => {
  // 清理 v1 旧数据（isArchived 为 boolean 的记录无法被 number 查询匹配）
  await tx.table('patients').clear()
  await tx.table('tasks').clear()
  await tx.table('taskTemplates').clear()
  // 重新填充种子数据
  await tx.table('taskTemplates').bulkAdd(seedTaskTemplates)
})

export { db }
export type { ResidentScheduleDB }
