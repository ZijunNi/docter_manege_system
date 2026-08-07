import type { Task } from '../../types/task'
import { TaskCategoryLabel } from '../../types/enums'
import { TaskCheckbox } from './TaskCheckbox'
import { useSwipe } from '../../hooks/useSwipe'
import { cn } from '../../utils/cn'

interface TaskItemProps {
  task: Task
  onToggle: () => void
}

export function TaskItem({ task, onToggle }: TaskItemProps) {
  const { onTouchStart, onTouchEnd } = useSwipe({
    onSwipeLeft: onToggle,
  })

  const categoryLabel = TaskCategoryLabel[task.category] || task.category

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className={cn(
        'flex items-start gap-3 px-4 py-3 bg-white border-b border-gray-50 transition-colors',
        task.isCompleted && 'opacity-50'
      )}
    >
      <TaskCheckbox checked={task.isCompleted} onChange={onToggle} />
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-sm text-gray-900',
          task.isCompleted && 'line-through'
        )}>
          {task.title}
        </p>
        {task.description && (
          <p className="text-xs text-gray-500 mt-0.5">{task.description}</p>
        )}
      </div>
      <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0">
        {categoryLabel}
      </span>
    </div>
  )
}
