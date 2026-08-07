import type { TaskCategory } from '../../types/enums'
import { TaskCategoryLabel } from '../../types/enums'

interface TaskGroupProps {
  category: TaskCategory
  children: React.ReactNode
}

export function TaskGroup({ category, children }: TaskGroupProps) {
  const label = TaskCategoryLabel[category] || category

  return (
    <div>
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {label}
        </span>
      </div>
      {children}
    </div>
  )
}
