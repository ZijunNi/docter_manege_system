export interface Patient {
  id: string
  name: string
  bedNumber?: string
  admissionDate: string
  isArchived: number  // 0 = 未归档, 1 = 已归档 (IndexedDB 不支持 boolean 索引)
  notes?: string
  createdAt: number
  updatedAt: number
}

export interface PatientInput {
  name: string
  bedNumber?: string
  admissionDate: string
  notes?: string
}
