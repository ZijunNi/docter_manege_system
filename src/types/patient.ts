import type { PatientStatus } from './enums'

export interface Patient {
  id?: number
  name: string
  bedNumber?: string
  admissionDate: string
  hasSurgery: boolean
  surgeryDate?: string
  preDischargeDate?: string
  dischargeDate?: string
  status: PatientStatus
  isArchived: number  // 0 = 未归档, 1 = 已归档 (IndexedDB 不支持 boolean 索引)
  notes?: string
  createdAt: number
  updatedAt: number
}

export interface PatientInput {
  name: string
  bedNumber?: string
  admissionDate: string
  hasSurgery: boolean
  surgeryDate?: string
  preDischargeDate?: string
  dischargeDate?: string
  notes?: string
}
