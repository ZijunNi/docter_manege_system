import { useState } from 'react'
import { Header } from '../components/layout/Header'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { db } from '../db'

export function SettingsPage() {
  const [showClearDialog, setShowClearDialog] = useState(false)

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

  return (
    <div>
      <Header title="设置" />
      <div className="px-4 py-4 flex flex-col gap-2">
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
