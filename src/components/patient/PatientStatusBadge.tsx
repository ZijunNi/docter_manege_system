import { PatientStatus, PatientStatusLabel } from '../../types/enums'
import { STATUS_DOT_COLORS } from '../../utils/constants'

interface PatientStatusBadgeProps {
  status: PatientStatus
  size?: 'sm' | 'md'
}

export function PatientStatusBadge({ status, size = 'sm' }: PatientStatusBadgeProps) {
  const dotColor = STATUS_DOT_COLORS[status] || 'bg-gray-400'
  const label = PatientStatusLabel[status] || status

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
