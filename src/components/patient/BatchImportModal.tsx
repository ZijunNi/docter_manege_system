import { useState, useMemo } from 'react'
import { Modal } from '../ui/Modal'
import { addPatient } from '../../services/patient-service'
import { parseFlexibleDate, today } from '../../utils/date'
import type { PatientInput } from '../../types/patient'

export interface ParsedRow {
  name: string
  bedNumber: string
  admissionDate: string
  notes: string
  error: string | null       // 致命错误（如缺少姓名）
  dateWarning: string | null  // 日期无法解析的警告
}

interface BatchImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImported: () => void
}

const PLACEHOLDER = `张三  12床  20260807
李四  15床
王五  8床  2026.8.5  急诊入院
赵六  2026年8月7日
周七  3床  2026-08-07  备注内容`

const FORMAT_HINT = '每行一个患者，空格/Tab/逗号分隔。格式：姓名 床位号 入院日期 备注。除姓名外均可省略，日期默认今天。'

/** 分割一行文本：Tab → 2+空格 → 逗号 */
function splitLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t')
  if (/  +/.test(line)) return line.split(/  +/)
  if (line.includes(',')) return line.split(',')
  return [line]
}

/** 分段检测日期字段，返回 { date, dateIdx, fieldsWithoutDate } */
function extractDate(segments: string[]): {
  dateStr: string | null
  dateWarning: string | null
  otherFields: string[]
} {
  for (let i = 0; i < segments.length; i++) {
    const parsed = parseFlexibleDate(segments[i])
    if (parsed) {
      const others = [...segments]
      others.splice(i, 1)
      return { dateStr: parsed, dateWarning: null, otherFields: others }
    }
  }
  // 没有找到日期——检查是否有看起来像日期但解析失败的段
  for (const seg of segments) {
    if (/\d{4}/.test(seg) && /[年月日.\-/]/.test(seg)) {
      return { dateStr: null, dateWarning: `无法识别日期"${seg}"，将默认使用今天`, otherFields: segments }
    }
  }
  return { dateStr: null, dateWarning: null, otherFields: segments }
}

function parseRows(text: string): ParsedRow[] {
  const lines = text.split('\n').filter(line => line.trim() !== '')
  return lines.map(line => {
    const segments = splitLine(line)
      .map(s => s.trim())
      .filter(s => s.length > 0)

    if (segments.length === 0) {
      return { name: '', bedNumber: '', admissionDate: today(), notes: '', error: '空行', dateWarning: null }
    }

    const { dateStr, dateWarning, otherFields } = extractDate(segments)

    const name = otherFields[0] || ''
    const bedNumber = otherFields[1] || ''
    const notes = otherFields.slice(2).join(' ')

    const error = !name ? '缺少姓名' : null

    return {
      name,
      bedNumber,
      admissionDate: dateStr || today(),
      notes,
      error,
      dateWarning,
    }
  })
}

export function BatchImportModal({ isOpen, onClose, onImported }: BatchImportModalProps) {
  const [text, setText] = useState('')
  const [importing, setImporting] = useState(false)

  const rows = useMemo(() => parseRows(text), [text])

  const validRows = rows.filter(r => !r.error)
  const errorCount = rows.length - validRows.length

  const handleImport = async () => {
    if (validRows.length === 0) return
    setImporting(true)
    try {
      for (const row of validRows) {
        const input: PatientInput = {
          name: row.name,
          bedNumber: row.bedNumber || undefined,
          admissionDate: row.admissionDate,
          notes: row.notes || undefined,
        }
        await addPatient(input)
      }
      onImported()
      setText('')
      onClose()
    } catch (err) {
      console.error('Batch import failed:', err)
      alert('导入失败，请重试')
    } finally {
      setImporting(false)
    }
  }

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="批量导入患者">
      <div className="flex flex-col gap-3">
        {/* 输入区 */}
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={6}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          disabled={importing}
        />

        {/* 格式提示 */}
        <p className="text-xs text-gray-400">{FORMAT_HINT}</p>

        {/* 预览区 */}
        {rows.length > 0 && (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="max-h-48 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 text-left text-gray-500 font-medium">姓名</th>
                    <th className="px-2 py-1.5 text-left text-gray-500 font-medium">床位</th>
                    <th className="px-2 py-1.5 text-left text-gray-500 font-medium">入院日期</th>
                    <th className="px-2 py-1.5 text-left text-gray-500 font-medium">备注</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={i}
                      className={`border-t border-gray-100 ${row.error ? 'bg-red-50' : row.dateWarning ? 'bg-yellow-50' : ''}`}
                    >
                      <td className="px-2 py-1.5">
                        <span className={row.error ? 'text-red-600' : 'text-gray-900'}>
                          {row.name || '—'}
                        </span>
                        {row.error && (
                          <span className="ml-1 text-red-400">{row.error}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-gray-600">{row.bedNumber || '—'}</td>
                      <td className="px-2 py-1.5 text-gray-600">
                        {row.dateWarning ? (
                          <span className="text-yellow-600" title={row.dateWarning}>
                            {row.admissionDate}*
                          </span>
                        ) : (
                          row.admissionDate
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-gray-500">{row.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-2 py-1.5 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 flex justify-between">
              <span>共 {rows.length} 行，{validRows.length} 行有效</span>
              {errorCount > 0 && <span className="text-red-500">{errorCount} 行有误</span>}
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="flex-1 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={validRows.length === 0 || importing}
            className="flex-1 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {importing ? '导入中...' : `确认导入 (${validRows.length}人)`}
          </button>
        </div>
      </div>
    </Modal>
  )
}
