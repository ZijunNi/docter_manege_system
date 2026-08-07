import { db } from '../db'
import type { Patient, PatientInput } from '../types/patient'
import { PatientStatus } from '../types/enums'
import { today } from '../utils/date'
import { determinePatientStatus } from '../engine/state-machine'
import { generateTasksForPatient } from '../engine/task-generator'

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

export async function getPatientById(id: number): Promise<Patient | undefined> {
  return db.patients.get(id)
}

export async function addPatient(input: PatientInput): Promise<Patient> {
  const now = Date.now()
  const date = today()
  const status = determinePatientStatus({
    ...input,
    status: PatientStatus.DAY0_ADMISSION,
    isArchived: 0,
    createdAt: now,
    updatedAt: now,
    admissionDate: input.admissionDate,
    hasSurgery: input.hasSurgery,
  }, date)

  const id = await db.patients.add({
    name: input.name,
    bedNumber: input.bedNumber,
    admissionDate: input.admissionDate,
    hasSurgery: input.hasSurgery,
    surgeryDate: input.surgeryDate,
    preDischargeDate: input.preDischargeDate,
    dischargeDate: input.dischargeDate,
    notes: input.notes,
    status,
    isArchived: 0,
    createdAt: now,
    updatedAt: now,
  } as Patient)

  const patient = await db.patients.get(id)
  if (!patient) throw new Error('Failed to create patient')

  // 立即生成当天的任务
  await generateTasksForPatient(patient, date)

  return patient
}

export async function updatePatient(id: number, input: PatientInput): Promise<void> {
  const now = Date.now()
  await db.patients.update(id, {
    ...input,
    updatedAt: now,
  })
}

export async function deletePatient(id: number): Promise<void> {
  await db.patients.delete(id)
  // 级联删除关联任务
  await db.tasks.where('patientId').equals(id).delete()
}

export async function archivePatient(id: number): Promise<void> {
  const now = Date.now()
  await db.patients.update(id, {
    isArchived: 1,
    status: PatientStatus.ARCHIVED,
    updatedAt: now,
  })
}

export async function unarchivePatient(id: number): Promise<void> {
  const now = Date.now()
  const patient = await db.patients.get(id)
  if (!patient) return

  const newStatus = determinePatientStatus(patient as Patient, today())
  await db.patients.update(id, {
    isArchived: 0,
    status: newStatus,
    updatedAt: now,
  })
}
