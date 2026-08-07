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

db.version(6).stores({
  patients: '++id, status, isArchived, admissionDate',
  tasks: '++id, patientId, date, status, [patientId+date]',
  taskTemplates: '++id, key, patientStatus, weekday, surgeryPhase',
}).upgrade(async tx => {
  // 清理 v2 旧数据，确保多状态模型一致性
  await tx.table('patients').clear()
  await tx.table('tasks').clear()
  await tx.table('taskTemplates').clear()
  await tx.table('taskTemplates').bulkAdd(seedTaskTemplates)
})

export { db }
export type { ResidentScheduleDB }
