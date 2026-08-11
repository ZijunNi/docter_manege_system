import { db } from '../db'
import type { Patient, PatientInput } from '../types/patient'
import { today } from '../utils/date'
import { generateTasksForPatient, generateDailyTasks } from '../engine/task-generator'
import { createEntityId } from '../utils/id'

export async function getAllPatients(): Promise<Patient[]> {
  return db.patients
    .where('isArchived')
    .equals(0)
    .reverse()
    .sortBy('createdAt')
}

export async function getArchivedPatients(): Promise<Patient[]> {
  return db.patients
    .where('isArchived')
    .equals(1)
    .reverse()
    .sortBy('createdAt')
}

export async function getPatientById(id: string): Promise<Patient | undefined> {
  return db.patients.get(id)
}

export async function addPatient(input: PatientInput): Promise<Patient> {
  const now = Date.now()

  const id = createEntityId('patient')
  await db.patients.add({
    id,
    name: input.name,
    bedNumber: input.bedNumber,
    admissionDate: input.admissionDate,
    notes: input.notes,
    isArchived: 0,
    createdAt: now,
    updatedAt: now,
  } as Patient)

  const patient = await db.patients.get(id)
  if (!patient) throw new Error('Failed to create patient')

  // 立即生成当天的任务（基于入院事件模板）
  await generateTasksForPatient(patient, today())

  return patient
}

export async function updatePatient(id: string, input: PatientInput): Promise<void> {
  const now = Date.now()
  await db.patients.update(id, {
    name: input.name,
    bedNumber: input.bedNumber,
    admissionDate: input.admissionDate,
    notes: input.notes,
    updatedAt: now,
  })
  // 保存后刷新所有患者的任务状态
  await generateDailyTasks()
}

export async function deletePatient(id: string): Promise<void> {
  await db.transaction('rw', db.patients, db.tasks, db.patientEvents, db.onceTaskCompletions, async () => {
    await db.patients.delete(id)
    await db.tasks.where('patientId').equals(id).delete()
    await db.patientEvents.where('patientId').equals(id).delete()
    await db.onceTaskCompletions.where('patientId').equals(id).delete()
  })
}

export async function archivePatient(id: string): Promise<void> {
  const now = Date.now()
  await db.patients.update(id, {
    isArchived: 1,
    updatedAt: now,
  })
}

export async function unarchivePatient(id: string): Promise<void> {
  const now = Date.now()
  await db.patients.update(id, {
    isArchived: 0,
    updatedAt: now,
  })

  // 恢复后重新生成该患者的当天任务
  const patient = await db.patients.get(id)
  if (patient) {
    await generateTasksForPatient(patient)
  }
}
