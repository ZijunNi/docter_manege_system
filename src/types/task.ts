import type { TaskCategory } from './enums'

export interface Task {
  id: string
  patientId: string
  patientName: string
  date: string
  title: string
  description?: string
  category: TaskCategory
  statusLabel: string
  isCompleted: boolean
  completedAt?: number
  createdAt: number
  updatedAt: number
  order: number
  sourceKey: string
  sourceEventId?: string
  sourceTemplateTaskId?: string
  isOnceOnly: boolean
  isHistoricalImport?: boolean
}

export interface OnceTaskCompletion {
  id: string
  patientId: string
  sourceKey: string
  sourceEventId?: string
  sourceTemplateTaskId?: string
  completedDate: string
  completedAt: number
}
