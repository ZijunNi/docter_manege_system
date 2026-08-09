import { useState } from 'react'
import { Header } from '../components/layout/Header'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { BatchImportModal } from '../components/patient/BatchImportModal'
import { db } from '../db'
import { isDevModeEnabled, setDevModeEnabled, getOverrideDate, setOverrideDate } from '../utils/devmode'
import { today, realToday } from '../utils/date'
import { generateDailyTasks } from '../engine/task-generator'

export function SettingsPage() {
  const [showClearDialog, setShowClearDialog] = useState(false)
  const [showBatchImport, setShowBatchImport] = useState(false)
  const [devMode, setDevMode] = useState(() => isDevModeEnabled())
  const [overrideDate, setOverrideDateState] = useState(() => getOverrideDate() || realToday())

  const handleExport = async () => {
    try {
      const patients = await db.patients.toArray()
      const tasks = await db.tasks.toArray()
      const data = {
        version: 1,
        exportDate: new Date().toISOString(),
        patients,
        tasks,
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `resident-schedule-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
      alert('导出失败，请重试')
    }
  }

  const handleImport = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        if (data.patients) {
          for (const p of data.patients) {
            const exists = await db.patients.get(p.id)
            if (!exists) {
              await db.patients.add(p)
            }
          }
        }
        if (data.tasks) {
          for (const t of data.tasks) {
            const exists = await db.tasks.get(t.id)
            if (!exists) {
              await db.tasks.add(t)
            }
          }
        }
        alert('导入成功！')
        window.location.reload()
      } catch (err) {
        console.error('Import failed:', err)
        alert('导入失败，请检查文件格式')
      }
    }
    input.click()
  }

  const handleClearAll = async () => {
    await db.patients.clear()
    await db.tasks.clear()
    window.location.reload()
  }

  const handleDevModeToggle = () => {
    const next = !devMode
    setDevMode(next)
    setDevModeEnabled(next)
    if (next) {
      setOverrideDate(overrideDate)
    }
    // 刷新数据以反映新日期
    generateDailyTasks().then(() => {
      window.location.reload()
    })
  }

  const handleOverrideDateChange = (date: string) => {
    setOverrideDateState(date)
    setOverrideDate(date)
    // 立即刷新以反映新日期
    generateDailyTasks().then(() => {
      window.location.reload()
    })
  }

  return (
    <div>
      <Header title="设置" />
      <div className="px-4 py-4 flex flex-col gap-2">

        {/* 开发模式 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <span className="text-gray-900 font-medium text-sm">🛠 开发模式</span>
              <p className="text-xs text-gray-400 mt-0.5">手动指定"今天"日期，方便测试不同场景</p>
            </div>
            <button
              onClick={handleDevModeToggle}
              className={`relative w-11 h-6 rounded-full transition-colors ${devMode ? 'bg-orange-500' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${devMode ? 'translate-x-5' : ''}`} />
            </button>
          </div>
          {devMode && (
            <div className="px-4 py-3 bg-orange-50">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                <span className="text-xs font-medium text-orange-700">开发模式已开启</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 flex-shrink-0">当前日期:</label>
                <input
                  type="date"
                  value={overrideDate}
                  onChange={e => handleOverrideDateChange(e.target.value)}
                  className="flex-1 px-2 py-1.5 text-sm border border-orange-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
              <p className="text-xs text-orange-500 mt-2">
                系统真实日期: {realToday()}，当前模拟日期: {today()}
              </p>
            </div>
          )}
        </div>

        <button
          onClick={() => setShowBatchImport(true)}
          className="w-full py-3 text-left px-4 bg-white rounded-lg shadow-sm border border-gray-100 text-gray-900 hover:bg-gray-50 transition-colors"
        >
          📋 批量导入患者
        </button>
        <button
          onClick={handleExport}
          className="w-full py-3 text-left px-4 bg-white rounded-lg shadow-sm border border-gray-100 text-gray-900 hover:bg-gray-50 transition-colors"
        >
          📤 导出数据备份
        </button>
        <button
          onClick={handleImport}
          className="w-full py-3 text-left px-4 bg-white rounded-lg shadow-sm border border-gray-100 text-gray-900 hover:bg-gray-50 transition-colors"
        >
          📥 导入数据恢复
        </button>
        <button
          onClick={() => setShowClearDialog(true)}
          className="w-full py-3 text-left px-4 bg-white rounded-lg shadow-sm border border-red-100 text-red-600 hover:bg-red-50 transition-colors"
        >
          🗑 清空所有数据
        </button>

        <div className="mt-6 px-4 py-3 bg-white rounded-lg shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">
            住院医师日程管家 v1.0.0
          </p>
          <p className="text-xs text-gray-400 mt-1">
            本地离线 PWA · 数据仅存储在您的设备上
          </p>
        </div>
      </div>

      <BatchImportModal
        isOpen={showBatchImport}
        onClose={() => setShowBatchImport(false)}
        onImported={() => {
          generateDailyTasks().then(() => {
            window.location.reload()
          })
        }}
      />

      <ConfirmDialog
        isOpen={showClearDialog}
        onConfirm={handleClearAll}
        onCancel={() => setShowClearDialog(false)}
        title="清空所有数据"
        message="此操作将永久删除所有患者和任务数据，不可撤销。建议先导出备份。确定要继续吗？"
        confirmText="确认清空"
      />
    </div>
  )
}
