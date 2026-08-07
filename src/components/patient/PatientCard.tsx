import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Patient } from '../../types/patient'
import { PatientStatusBadge } from './PatientStatusBadge'
import { STATUS_COLORS } from '../../utils/constants'
import { daysAfterAdmission, formatDisplayDate, today, toISODate } from '../../utils/date'
import { cn } from '../../utils/cn'
import { updatePatient } from '../../services/patient-service'

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
  const hasDischarge = !!patient.dischargeDate

  // 菜单状态
  const [menuOpen, setMenuOpen] = useState(false)
  const [quickAction, setQuickAction] = useState<'surgery' | 'discharge' | null>(null)
  const [actionDate, setActionDate] = useState('')
  const [saving, setSaving] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭菜单
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

  const openQuickAction = (e: React.MouseEvent, type: 'surgery' | 'discharge') => {
    e.stopPropagation()
    setMenuOpen(false)
    setQuickAction(type)
    if (type === 'surgery' && !patient.surgeryDate) {
      setActionDate(findNextThu(patient.admissionDate))
    } else if (type === 'surgery' && patient.surgeryDate) {
      setActionDate(patient.surgeryDate)
    } else if (type === 'discharge' && patient.dischargeDate) {
      setActionDate(patient.dischargeDate)
    } else {
      setActionDate(today())
    }
  }

  const handleSaveQuickAction = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!patient.id || !actionDate) return
    setSaving(true)
    try {
      if (quickAction === 'surgery') {
        await updatePatient(patient.id, {
          name: patient.name,
          admissionDate: patient.admissionDate,
          hasSurgery: true,
          surgeryDate: actionDate,
          dischargeDate: patient.dischargeDate,
          notes: patient.notes,
        })
      } else if (quickAction === 'discharge') {
        await updatePatient(patient.id, {
          name: patient.name,
          admissionDate: patient.admissionDate,
          hasSurgery: patient.hasSurgery,
          surgeryDate: patient.surgeryDate,
          dischargeDate: actionDate,
          notes: patient.notes,
        })
      }
      setQuickAction(null)
    } finally {
      setSaving(false)
    }
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
            <PatientStatusBadge status={patient.status} />
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
                  <button
                    onClick={e => openQuickAction(e, 'surgery')}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <span>🔪</span>
                    {hasSurgery ? '修改手术日期' : '添加手术'}
                  </button>
                  <button
                    onClick={e => openQuickAction(e, 'discharge')}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <span>🏥</span>
                    {hasDischarge ? '修改出院日期' : '添加出院'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
          <span>入院: {formatDisplayDate(patient.admissionDate)}</span>
          <span>第 {days + 1} 天</span>
          {hasSurgery && <span>🔪 手术: {formatDisplayDate(patient.surgeryDate!)}</span>}
          {hasDischarge && <span className="text-amber-600">出院: {formatDisplayDate(patient.dischargeDate!)}</span>}
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
              {quickAction === 'surgery' ? (hasSurgery ? '修改手术日期' : '添加手术') : (hasDischarge ? '修改出院日期' : '添加出院')}
            </h3>
            <div className="flex flex-col gap-1.5 mb-4">
              <label className="text-sm font-medium text-gray-700">日期</label>
              <input
                type="date"
                value={actionDate}
                onChange={e => setActionDate(e.target.value)}
                min={quickAction === 'surgery' ? patient.admissionDate : today()}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            {quickAction === 'surgery' && (
              <p className="text-xs text-gray-500 mb-4">默认周四进行手术，可根据实际情况修改</p>
            )}
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

/** 找到入院后的第一个周四 */
function findNextThu(admissionDate: string): string {
  const d = new Date(admissionDate + 'T00:00:00')
  while (d.getDay() !== 4) {
    d.setDate(d.getDate() + 1)
  }
  return toISODate(d)
}
