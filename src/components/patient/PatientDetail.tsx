import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Patient } from '../../types/patient'
import { useTodayTasks } from '../../hooks/useTasks'
import { usePatientStatuses } from '../../hooks/usePatientStatuses'
import { usePatientEvents } from '../../hooks/usePatientEvents'
import { PatientStatusBadge } from './PatientStatusBadge'
import { TaskList } from '../task/TaskList'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { toggleTaskComplete } from '../../services/task-service'
import { archivePatient, unarchivePatient, deletePatient } from '../../services/patient-service'
import { formatDisplayDate, daysAfterAdmission, today } from '../../utils/date'

interface PatientDetailProps {
  patient: Patient
}

export function PatientDetail({ patient }: PatientDetailProps) {
  const navigate = useNavigate()
  const { tasks, loading, total, completed } = useTodayTasks(patient.id!)
  const { statuses, primary, loading: statusLoading } = usePatientStatuses(patient.id!)
  const { events, eventTypes } = usePatientEvents(patient.id!)
  const [showArchiveDialog, setShowArchiveDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const days = daysAfterAdmission(patient.admissionDate, today())

  const handleToggle = async (taskId: number) => {
    await toggleTaskComplete(taskId)
  }

  const handleArchive = async () => {
    if (!patient.id) return
    await archivePatient(patient.id)
    navigate('/')
  }

  const handleUnarchive = async () => {
    if (!patient.id) return
    await unarchivePatient(patient.id)
    navigate(`/patient/${patient.id}`)
  }

  const handleDelete = async () => {
    if (!patient.id) return
    await deletePatient(patient.id)
    navigate('/')
  }

  return (
    <div>
      {/* 患者信息区 */}
      <div className="bg-white px-4 py-4 border-b border-gray-100">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{patient.name}</h2>
            {patient.bedNumber && (
              <p className="text-sm text-gray-500 mt-0.5">床位: {patient.bedNumber}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-1 justify-end">
            {!statusLoading && statuses.map(s => (
              <PatientStatusBadge
                key={s.eventRangeId}
                label={s.statusLabel}
                dotColor={extractDotColor(s.color)}
                size="md"
              />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 mb-1">
          <span>入院: {formatDisplayDate(patient.admissionDate)}</span>
          <span>已住院 {days + 1} 天</span>
          {events.map(pe => {
            const et = eventTypes.get(pe.eventTypeId)
            if (!et) return null
            return (
              <span key={pe.id}>
                {et.icon} {et.name}: {formatDisplayDate(pe.eventDate)}
              </span>
            )
          })}
        </div>

        {patient.notes && (
          <p className="text-sm text-gray-500 mt-2 bg-gray-50 p-2 rounded">{patient.notes}</p>
        )}

        {/* 任务进度 */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${completed === total && total > 0 ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
            />
          </div>
          <span className="text-sm font-medium text-gray-600">
            {completed}/{total}
          </span>
        </div>
      </div>

      {/* 操作区 */}
      <div className="flex gap-2 px-4 py-3 bg-white border-b border-gray-100">
        <button
          onClick={() => navigate(`/patient/${patient.id}/edit`)}
          className="flex-1 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
        >
          ✏️ 编辑
        </button>
        {patient.isArchived ? (
          <button
            onClick={handleUnarchive}
            className="flex-1 py-2 text-sm font-medium text-green-600 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
          >
            📤 取消归档
          </button>
        ) : (
          <button
            onClick={() => setShowArchiveDialog(true)}
            className="flex-1 py-2 text-sm font-medium text-amber-600 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
          >
            📁 归档
          </button>
        )}
        <button
          onClick={() => setShowDeleteDialog(true)}
          className="flex-1 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
        >
          🗑 删除
        </button>
      </div>

      {/* 今日待办 */}
      <div className="py-2">
        <div className="px-4 py-2">
          <h3 className="text-sm font-semibold text-gray-500">
            今日待办 ({today()})
          </h3>
        </div>
        {loading ? (
          <LoadingSpinner />
        ) : (
          <TaskList tasks={tasks} onToggle={handleToggle} />
        )}
      </div>

      {/* 归档确认 */}
      <ConfirmDialog
        isOpen={showArchiveDialog}
        onConfirm={handleArchive}
        onCancel={() => setShowArchiveDialog(false)}
        title="归档患者"
        message={`确定要归档「${patient.name}」吗？归档后可在归档列表中查看。`}
        confirmText="归档"
      />

      {/* 删除确认 */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
        title="删除患者"
        message={`确定要删除「${patient.name}」吗？此操作不可撤销，所有关联的任务和记录将被永久删除。`}
        confirmText="确认删除"
      />
    </div>
  )
}

/** 从 EventRange.color 提取 dot color class */
function extractDotColor(color: string): string {
  const match = color.match(/border-l-(\w+-\d+)/)
  if (match) {
    return `bg-${match[1]}`
  }
  return 'bg-gray-400'
}
