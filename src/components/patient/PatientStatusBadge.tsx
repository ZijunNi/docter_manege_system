interface PatientStatusBadgeProps {
  label: string
  dotColor?: string    // Tailwind bg color class, e.g., "bg-red-500"
  size?: 'sm' | 'md'
}

export function PatientStatusBadge({ label, dotColor = 'bg-gray-400', size = 'sm' }: PatientStatusBadgeProps) {
  const sizeClasses = size === 'sm'
    ? 'text-xs px-2 py-0.5'
    : 'text-sm px-3 py-1'

  return (
    <span className={`inline-flex items-center gap-1 ${sizeClasses} rounded-full bg-gray-100 text-gray-700 font-medium`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      {label}
    </span>
  )
}
