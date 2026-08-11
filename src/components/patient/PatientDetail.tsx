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
import { Modal } from '../ui/Modal'
import { toggleTaskComplete } from '../../services/task-service'
import { archivePatient, unarchivePatient, deletePatient } from '../../services/patient-service'
import { addTemporaryTask, removeTemporaryTask } from '../../services/event-service'
import { generateTasksForPatient } from '../../engine/task-generator'
import { formatDisplayDate, daysAfterAdmission, today } from '../../utils/date'
import { TaskCategory, TaskCategoryLabel } from '../../types/enums'

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
  const [showTempModal, setShowTempModal] = useState(false)
  const [tempTitle, setTempTitle] = useState('')
  const [tempDesc, setTempDesc] = useState('')
  const [tempCategory, setTempCategory] = useState<TaskCategory>(TaskCategory.TEMPORARY)
  const [tempDate, setTempDate] = useState(today())
  const [tempSaving, setTempSaving] = useState(false)

  const handleAddTemporary = async () => {
    if (!tempTitle.trim() || !patient.id) return
    setTempSaving(true)
    try {
      await addTemporaryTask(patient.id, tempDate, tempTitle.trim(), tempDesc.trim() || undefined, tempCategory)
      await generateTasksForPatient(patient)
      setShowTempModal(false)
      setTempTitle('')
      setTempDesc('')
      setTempCategory(TaskCategory.TEMPORARY)
      setTempDate(today())
    } catch (err) {
      console.error('Failed to add temporary task:', err)
      alert('添加失败，请重试')
    } finally {
      setTempSaving(false)
    }
  }

  const openTempModal = () => {
    setTempDate(today())
    setShowTempModal(true)
  }

  // 删除临时待办：sourceKey 格式为 "temporary:<patient-event-id>"。
  const handleDeleteTemporary = async (sourceKey: string) => {
    if (!patient.id) return
    const match = sourceKey.match(/^temporary:(patient-event:.+)$/)
    if (match) {
      await removeTemporaryTask(match[1])
    } else {
      // 兜底：按标题匹配（兼容旧数据）
      const tempEvents = events.filter(pe => {
        const et = eventTypes.get(pe.eventTypeId)
        return et?.key === 'temporary' && pe.customTitle === sourceKey && pe.eventDate === today()
      })
      for (const pe of tempEvents) {
        await removeTemporaryTask(pe.id!)
      }
    }
    await generateTasksForPatient(patient)
  }

  // 非今天的临时待办
  const nonTodayTempEvents = events.filter(pe => {
    const et = eventTypes.get(pe.eventTypeId)
    return et?.key === 'temporary' && pe.eventDate !== today()
  }).sort((a, b) => a.eventDate.localeCompare(b.eventDate))

  const days = daysAfterAdmission(patient.admissionDate, today())

  const handleToggle = async (taskId: string) => {
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
        <div className="px-4 py-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-500">
            今日待办 ({today()})
          </h3>
          <button
            onClick={openTempModal}
            className="text-xs text-blue-600 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
          >
            ＋ 临时
          </button>
        </div>
        {loading ? (
          <LoadingSpinner />
        ) : (
          <TaskList
            tasks={tasks}
            onToggle={handleToggle}
            onDeleteTemporary={handleDeleteTemporary}
          />
        )}
      </div>

      {/* 非今天的临时待办 */}
      {nonTodayTempEvents.length > 0 && (
        <div className="py-2 border-t border-gray-200">
          <div className="px-4 py-2">
            <h3 className="text-sm font-semibold text-gray-500">其他日期临时待办</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {nonTodayTempEvents.map(pe => (
              <div key={pe.id} className="flex items-center gap-3 px-4 py-2.5 bg-white">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700">{pe.customTitle}</p>
                  {pe.customDescription && (
                    <p className="text-xs text-gray-400 mt-0.5">{pe.customDescription}</p>
                  )}
                </div>
                <span className="text-xs text-gray-400">{formatDisplayDate(pe.eventDate)}</span>
                <span className="text-xs text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded flex-shrink-0">
                  {TaskCategoryLabel[pe.customCategory as TaskCategory] || '临时'}
                </span>
                <button
                  onClick={async () => {
                    if (!patient.id) return
                    await removeTemporaryTask(pe.id!)
                    await generateTasksForPatient(patient)
                  }}
                  className="text-gray-400 hover:text-red-500 text-sm font-bold px-1"
                  title="删除临时待办"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 临时待办 Modal */}
      <Modal
        isOpen={showTempModal}
        onClose={() => setShowTempModal(false)}
        title="添加临时待办"
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">待办标题 *</label>
            <input
              type="text"
              value={tempTitle}
              onChange={e => setTempTitle(e.target.value)}
              placeholder="如：请心内科会诊"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">描述（可选）</label>
            <input
              type="text"
              value={tempDesc}
              onChange={e => setTempDesc(e.target.value)}
              placeholder="补充说明"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">分类</label>
              <select
                value={tempCategory}
                onChange={e => setTempCategory(e.target.value as TaskCategory)}
                className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(TaskCategoryLabel).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">日期</label>
              <input
                type="date"
                value={tempDate}
                onChange={e => setTempDate(e.target.value)}
                className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => setShowTempModal(false)}
              className="flex-1 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleAddTemporary}
              disabled={!tempTitle.trim() || tempSaving}
              className="flex-1 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {tempSaving ? '添加中...' : '确认添加'}
            </button>
          </div>
        </div>
      </Modal>

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
