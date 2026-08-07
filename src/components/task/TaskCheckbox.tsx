import { cn } from '../../utils/cn'

interface TaskCheckboxProps {
  checked: boolean
  onChange: () => void
}

export function TaskCheckbox({ checked, onChange }: TaskCheckboxProps) {
  return (
    <button
      onClick={e => {
        e.stopPropagation()
        onChange()
      }}
      className={cn(
        'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors',
        checked
          ? 'bg-green-500 border-green-500'
          : 'border-gray-300 hover:border-green-400'
      )}
    >
      {checked && <span className="text-white text-xs">✓</span>}
    </button>
  )
}
