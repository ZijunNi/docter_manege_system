import { useState } from 'react'
import type { PatientInput } from '../../types/patient'
import type { EventType, PatientEvent } from '../../types/event'
import { DatePicker } from '../ui/DatePicker'
import { today } from '../../utils/date'
import { useActiveEventTypes } from '../../hooks/useEventTypes'
import { usePatientEvents } from '../../hooks/usePatientEvents'

export interface EventAssignment {
  eventTypeId: number
  eventDate: string
}

interface PatientFormProps {
  initial?: PatientInput
  initialEvents?: PatientEvent[]
  onSubmit: (data: PatientInput, events: EventAssignment[]) => void
  onCancel: () => void
  submitLabel?: string
  disabled?: boolean
}

export function PatientForm({
  initial,
  initialEvents,
  onSubmit,
  onCancel,
  submitLabel = '保存',
  disabled = false,
}: PatientFormProps) {
  const [name, setName] = useState(initial?.name || '')
  const [bedNumber, setBedNumber] = useState(initial?.bedNumber || '')
  const [admissionDate, setAdmissionDate] = useState(initial?.admissionDate || today())
  const [notes, setNotes] = useState(initial?.notes || '')

  // 事件分配状态：{ [eventTypeKey]: date | null }
  const { eventTypes: activeTypes } = useActiveEventTypes()
  const nonAdmissionTypes = activeTypes.filter(et => et.key !== 'admission' && et.isActive)

  // 初始化事件日期（编辑模式）
  const [eventDates, setEventDates] = useState<Record<string, string>>(() => {
    const dates: Record<string, string> = {}
    if (initialEvents) {
      for (const pe of initialEvents) {
        const et = activeTypes.find(t => t.id === pe.eventTypeId)
        if (et) {
          dates[et.key] = pe.eventDate
        }
      }
    }
    return dates
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    const patientInput: PatientInput = {
      name: name.trim(),
      bedNumber: bedNumber.trim() || undefined,
      admissionDate,
      notes: notes.trim() || undefined,
    }

    const eventAssignments: EventAssignment[] = []
    for (const et of nonAdmissionTypes) {
      const date = eventDates[et.key]
      if (date) {
        eventAssignments.push({ eventTypeId: et.id!, eventDate: date })
      }
    }

    onSubmit(patientInput, eventAssignments)
  }

  const handleSetEventDate = (eventType: EventType, date: string) => {
    setEventDates(prev => ({ ...prev, [eventType.key]: date }))
  }

  const handleRemoveEventDate = (eventType: EventType) => {
    setEventDates(prev => {
      const next = { ...prev }
      delete next[eventType.key]
      return next
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* 姓名 */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">
          姓名 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="请输入患者姓名"
          required
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* 床位号 */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">床位号</label>
        <input
          type="text"
          value={bedNumber}
          onChange={e => setBedNumber(e.target.value)}
          placeholder="如: 15床"
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* 入院日期 */}
      <DatePicker label="入院日期" value={admissionDate} onChange={setAdmissionDate} max={today()} required />

      {/* 事件区块 */}
      {nonAdmissionTypes.length > 0 && (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">事件</label>
          <div className="bg-gray-50 rounded-lg border border-gray-200 divide-y divide-gray-200">
            {nonAdmissionTypes.map(et => {
              const currentDate = eventDates[et.key]
              return (
                <div key={et.key} className="flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span>{et.icon}</span>
                    <span className="text-sm text-gray-700">{et.name}</span>
                    {currentDate && (
                      <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                        {currentDate}
                      </span>
                    )}
                  </div>
                  {currentDate ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="date"
                        value={currentDate}
                        onChange={e => handleSetEventDate(et, e.target.value)}
                        className="w-[130px] px-2 py-1 text-xs border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveEventDate(et)}
                        className="text-gray-400 hover:text-red-500 text-sm px-1"
                        title="移除事件日期"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSetEventDate(et, today())}
                      className="text-xs text-blue-600 font-medium hover:text-blue-700"
                    >
                      + 添加日期
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 备注 */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">备注</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="其他需要记录的信息..."
          rows={3}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
        />
      </div>

      {/* 按钮 */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={disabled}
          className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  )
}
