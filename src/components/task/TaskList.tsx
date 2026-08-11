import type { Task } from '../../types/task'
import type { TaskCategory } from '../../types/enums'
import { TaskItem } from './TaskItem'
import { TaskGroup } from './TaskGroup'
import { EmptyTaskState } from './EmptyTaskState'

interface TaskListProps {
  tasks: Task[]
  onToggle: (taskId: string) => void
  onDeleteTemporary?: (sourceKey: string) => void
}

export function TaskList({ tasks, onToggle, onDeleteTemporary }: TaskListProps) {
  if (tasks.length === 0) {
    return <EmptyTaskState />
  }

  // 按 category 分组
  const grouped = new Map<TaskCategory, Task[]>()
  for (const task of tasks) {
    const list = grouped.get(task.category) || []
    list.push(task)
    grouped.set(task.category, list)
  }

  return (
    <div className="divide-y divide-gray-100">
      {Array.from(grouped.entries()).map(([category, categoryTasks]) => (
        <TaskGroup key={category} category={category}>
          {categoryTasks.map(task => (
            <TaskItem
              key={task.id}
              task={task}
              onToggle={() => onToggle(task.id!)}
              onDeleteTemporary={onDeleteTemporary}
            />
          ))}
        </TaskGroup>
      ))}
    </div>
  )
}
