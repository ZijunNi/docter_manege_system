import { db } from '../db'
import type { Task } from '../types/task'
import { today } from '../utils/date'

export async function getTasksByPatientAndDate(patientId: number, date?: string): Promise<Task[]> {
  const d = date || today()
  return db.tasks
    .where('[patientId+date]')
    .equals([patientId, d])
    .sortBy('order')
}

export async function getTodayTasks(patientId: number): Promise<Task[]> {
  return getTasksByPatientAndDate(patientId, today())
}

export async function toggleTaskComplete(taskId: number): Promise<void> {
  const task = await db.tasks.get(taskId)
  if (!task) return

  await db.tasks.update(taskId, {
    isCompleted: !task.isCompleted,
    completedAt: !task.isCompleted ? Date.now() : undefined,
  })
}

export async function getTodayAllTasks(): Promise<Task[]> {
  return db.tasks
    .where('date')
    .equals(today())
    .toArray()
}

export async function getCompletedCountForToday(patientId: number): Promise<{ total: number; completed: number }> {
  const tasks = await getTodayTasks(patientId)
  return {
    total: tasks.length,
    completed: tasks.filter(t => t.isCompleted).length,
  }
}
