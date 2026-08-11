import { db } from '../db'
import type { Task } from '../types/task'
import { today } from '../utils/date'
import { onceCompletionId } from '../utils/id'

export async function getTasksByPatientAndDate(patientId: string, date?: string): Promise<Task[]> {
  const d = date || today()
  return db.tasks
    .where('[patientId+date]')
    .equals([patientId, d])
    .sortBy('order')
}

export async function getTodayTasks(patientId: string): Promise<Task[]> {
  return getTasksByPatientAndDate(patientId, today())
}

export async function toggleTaskComplete(taskId: string): Promise<void> {
  const task = await db.tasks.get(taskId)
  if (!task) return

  const completing = !task.isCompleted
  const completedAt = completing ? Date.now() : undefined
  await db.transaction('rw', db.tasks, db.onceTaskCompletions, async () => {
    await db.tasks.update(taskId, {
      isCompleted: completing,
      completedAt,
      updatedAt: Date.now(),
    })
    if (!task.isOnceOnly) return
    const id = onceCompletionId(task.patientId, task.sourceKey)
    if (completing) {
      await db.onceTaskCompletions.put({
        id,
        patientId: task.patientId,
        sourceKey: task.sourceKey,
        sourceEventId: task.sourceEventId,
        sourceTemplateTaskId: task.sourceTemplateTaskId,
        completedDate: task.date,
        completedAt: completedAt!,
      })
    } else {
      await db.onceTaskCompletions.delete(id)
    }
  })
}

export async function getTodayAllTasks(): Promise<Task[]> {
  return db.tasks
    .where('date')
    .equals(today())
    .toArray()
}

export async function getCompletedCountForToday(patientId: string): Promise<{ total: number; completed: number }> {
  const tasks = await getTodayTasks(patientId)
  return {
    total: tasks.length,
    completed: tasks.filter(t => t.isCompleted).length,
  }
}
