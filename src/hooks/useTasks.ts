import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Task } from '../types/task'
import { today } from '../utils/date'

export function useTodayTasks(patientId: number): {
  tasks: Task[]
  loading: boolean
  total: number
  completed: number
} {
  const tasks = useLiveQuery(
    () => db.tasks
      .where('[patientId+date]')
      .equals([patientId, today()])
      .sortBy('order'),
    [patientId]
  )

  const taskList = tasks || []
  return {
    tasks: taskList,
    loading: tasks === undefined,
    total: taskList.length,
    completed: taskList.filter(t => t.isCompleted).length,
  }
}

export function useTodayAllTasks(): {
  tasks: Task[]
  loading: boolean
} {
  const tasks = useLiveQuery(
    () => db.tasks
      .where('date')
      .equals(today())
      .toArray(),
    []
  )

  return {
    tasks: tasks || [],
    loading: tasks === undefined,
  }
}
