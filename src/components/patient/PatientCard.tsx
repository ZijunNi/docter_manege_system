import { useNavigate } from 'react-router-dom'
import type { Patient } from '../../types/patient'
import { PatientStatusBadge } from './PatientStatusBadge'
import { STATUS_COLORS } from '../../utils/constants'
import { daysAfterAdmission, formatDisplayDate, today } from '../../utils/date'
import { cn } from '../../utils/cn'

interface PatientCardProps {
  patient: Patient
  completedCount?: number
  totalCount?: number
}

export function PatientCard({ patient, completedCount, totalCount }: PatientCardProps) {
  const navigate = useNavigate()
  const colorClass = STATUS_COLORS[patient.status] || 'border-l-gray-300 bg-white'
  const days = daysAfterAdmission(patient.admissionDate, today())
  const hasSurgery = patient.hasSurgery && patient.surgeryDate

  return (
    <div
      onClick={() => navigate(`/patient/${patient.id}`)}
      className={cn(
        'border-l-4 rounded-lg p-4 shadow-sm cursor-pointer active:scale-[0.98] transition-transform',
        colorClass
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="font-semibold text-gray-900">{patient.name}</h3>
          {patient.bedNumber && (
            <p className="text-xs text-gray-500 mt-0.5">床位: {patient.bedNumber}</p>
          )}
        </div>
        <PatientStatusBadge status={patient.status} />
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
        <span>入院: {formatDisplayDate(patient.admissionDate)}</span>
        <span>第 {days + 1} 天</span>
        {hasSurgery && <span>🔪 手术: {formatDisplayDate(patient.surgeryDate!)}</span>}
      </div>

      {/* 任务进度条 */}
      {totalCount !== undefined && totalCount > 0 && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-500">今日任务</span>
            <span className={cn(
              'font-medium',
              completedCount === totalCount ? 'text-green-600' : 'text-blue-600'
            )}>
              {completedCount}/{totalCount}
            </span>
          </div>
          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                completedCount === totalCount ? 'bg-green-500' : 'bg-blue-500'
              )}
              style={{ width: `${totalCount > 0 ? (completedCount! / totalCount) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
