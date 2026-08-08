import type { TaskCategory } from './enums'

export interface Task {
  id?: number
  patientId: number
  patientName: string
  date: string
  title: string
  description?: string
  category: TaskCategory
  statusLabel: string
  isCompleted: boolean
  completedAt?: number
  createdAt: number
  order: number
  templateKey?: string
}
