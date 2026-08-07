import { useState } from 'react'
import type { PatientInput } from '../../types/patient'
import { DatePicker } from '../ui/DatePicker'
import { today, addDays } from '../../utils/date'
import { getNextWorkday } from '../../engine/holiday-utils'

interface PatientFormProps {
  initial?: PatientInput
  onSubmit: (data: PatientInput) => void
  onCancel: () => void
  submitLabel?: string
  disabled?: boolean
}

export function PatientForm({ initial, onSubmit, onCancel, submitLabel = '保存', disabled = false }: PatientFormProps) {
  const [name, setName] = useState(initial?.name || '')
  const [bedNumber, setBedNumber] = useState(initial?.bedNumber || '')
  const [admissionDate, setAdmissionDate] = useState(initial?.admissionDate || today())
  const [hasSurgery, setHasSurgery] = useState(initial?.hasSurgery || false)
  const [surgeryDate, setSurgeryDate] = useState(initial?.surgeryDate || '')
  const [preDischargeDate, setPreDischargeDate] = useState(initial?.preDischargeDate || '')
  const [dischargeDate, setDischargeDate] = useState(initial?.dischargeDate || '')
  const [notes, setNotes] = useState(initial?.notes || '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    onSubmit({
      name: name.trim(),
      bedNumber: bedNumber.trim() || undefined,
      admissionDate,
      hasSurgery,
      surgeryDate: hasSurgery ? surgeryDate : undefined,
      preDischargeDate: preDischargeDate || undefined,
      dischargeDate: dischargeDate || undefined,
      notes: notes.trim() || undefined,
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

      {/* 是否需要手术 */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">是否需要手术</label>
        <button
          type="button"
          onClick={() => {
            setHasSurgery(!hasSurgery)
            if (!hasSurgery) {
              // 默认：入院后第一个周四（工作日）
              setSurgeryDate(findNextThuAfter(admissionDate))
            }
          }}
          className={`relative w-11 h-6 rounded-full transition-colors ${hasSurgery ? 'bg-blue-600' : 'bg-gray-300'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${hasSurgery ? 'translate-x-5' : ''}`} />
        </button>
      </div>

      {/* 手术日期 */}
      {hasSurgery && (
        <DatePicker label="手术日期" value={surgeryDate} onChange={setSurgeryDate} min={admissionDate} />
      )}

      {/* 出院日期 */}
      <DatePicker label="出院日期" value={dischargeDate} onChange={setDischargeDate} min={admissionDate} />

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

/** 找到从某日期开始的第一个周四（工作日） */
function findNextThuAfter(date: string): string {
  const d = new Date(date + 'T00:00:00')
  while (d.getDay() !== 4) {
    d.setDate(d.getDate() + 1)
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
