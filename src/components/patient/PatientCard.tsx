import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Patient } from '../../types/patient'
import type { EventType } from '../../types/event'
import { PatientStatusBadge } from './PatientStatusBadge'
import { usePatientStatuses } from '../../hooks/usePatientStatuses'
import { usePatientEvents } from '../../hooks/usePatientEvents'
import { useActiveEventTypes } from '../../hooks/useEventTypes'
import { cn } from '../../utils/cn'
import { daysAfterAdmission, formatDisplayDate, today, toISODate } from '../../utils/date'
import { addPatientEvent, removePatientEventByType } from '../../services/event-service'
import { generateDailyTasks } from '../../engine/task-generator'

interface PatientCardProps {
  patient: Patient
  completedCount?: number
  totalCount?: number
}

export function PatientCard({ patient, completedCount, totalCount }: PatientCardProps) {
  const navigate = useNavigate()
  const days = daysAfterAdmission(patient.admissionDate, today())

  // 动态状态
  const { primary, loading: statusLoading } = usePatientStatuses(patient.id!)
  const { events, eventTypes: eventTypeMap } = usePatientEvents(patient.id!)
  const { eventTypes: activeTypes } = useActiveEventTypes()

  const nonAdmissionTypes = activeTypes.filter(et => et.key !== 'admission')

  // 颜色：从 primary status 获取，或使用默认
  const colorClass = primary?.color || 'border-l-gray-300 bg-white'

  // 菜单状态
  const [menuOpen, setMenuOpen] = useState(false)
  const [quickAction, setQuickAction] = useState<{ eventType: EventType } | null>(null)
  const [actionDate, setActionDate] = useState('')
  const [saving, setSaving] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setMenuOpen(!menuOpen)
  }

  const openQuickAction = (e: React.MouseEvent, eventType: EventType) => {
    e.stopPropagation()
    setMenuOpen(false)
    setQuickAction({ eventType })

    // 查找现有事件日期作为初始值
    const existing = events.find(pe => pe.eventTypeId === eventType.id)
    if (existing) {
      setActionDate(existing.eventDate)
    } else {
      setActionDate(today())
    }
  }

  const handleSaveQuickAction = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!patient.id || !quickAction || !actionDate) return
    setSaving(true)
    try {
      await addPatientEvent(patient.id, quickAction.eventType.id!, actionDate)
      await generateDailyTasks()
      setQuickAction(null)
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveEvent = async (e: React.MouseEvent, eventType: EventType) => {
    e.stopPropagation()
    if (!patient.id) return
    await removePatientEventByType(patient.id, eventType.id!)
    await generateDailyTasks()
  }

  return (
    <>
      <div
        onClick={() => navigate(`/patient/${patient.id}`)}
        className={cn(
          'border-l-4 rounded-lg p-4 shadow-sm cursor-pointer active:scale-[0.98] transition-transform relative',
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
          <div className="flex items-center gap-1">
            {primary && !statusLoading && (
              <PatientStatusBadge
                label={primary.statusLabel}
                dotColor={extractDotColor(primary.color)}
              />
            )}
            {/* 菜单按钮 */}
            <div ref={menuRef} className="relative">
              <button
                onClick={handleMenuClick}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-black/10 text-gray-500 text-lg leading-none transition-colors"
              >
                ⋮
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-8 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-30 min-w-[140px]">
                  {nonAdmissionTypes.map(et => {
                    const hasEvent = events.some(pe => pe.eventTypeId === et.id)
                    return (
                      <button
                        key={et.id}
                        onClick={e => openQuickAction(e, et)}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <span>{et.icon}</span>
                        {hasEvent ? `修改${et.name}日期` : `添加${et.name}`}
                      </button>
                    )
                  })}
                  {nonAdmissionTypes.length === 0 && (
                    <span className="block px-4 py-2.5 text-xs text-gray-400">暂无可用事件类型</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
          <span>入院: {formatDisplayDate(patient.admissionDate)}</span>
          <span>第 {days + 1} 天</span>
          {events.map(pe => {
            const et = eventTypeMap.get(pe.eventTypeId)
            if (!et) return null
            return (
              <span key={pe.id} className="flex items-center gap-0.5">
                {et.icon} {et.name}: {formatDisplayDate(pe.eventDate)}
                <button
                  onClick={e => handleRemoveEvent(e, et)}
                  className="text-gray-400 hover:text-red-500 ml-0.5"
                  title={`移除${et.name}事件`}
                >
                  ×
                </button>
              </span>
            )
          })}
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

      {/* 快速操作日期选择弹窗 */}
      {quickAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setQuickAction(null)}>
          <div className="fixed inset-0 bg-black/40" />
          <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {quickAction.eventType.icon} {quickAction.eventType.name}日期
            </h3>
            <div className="flex flex-col gap-1.5 mb-4">
              <label className="text-sm font-medium text-gray-700">日期</label>
              <input
                type="date"
                value={actionDate}
                onChange={e => setActionDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setQuickAction(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveQuickAction}
                disabled={saving || !actionDate}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/** 从 EventRange.color 提取 dot color class */
function extractDotColor(color: string): string {
  // color 格式如 "border-l-red-500 bg-red-50"
  // 提取中间的 bg-xxx-500 作为 dot color
  const match = color.match(/border-l-(\w+-\d+)/)
  if (match) {
    return `bg-${match[1]}`
  }
  return 'bg-gray-400'
}
