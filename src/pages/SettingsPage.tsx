import { useState } from 'react'
import { Header } from '../components/layout/Header'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { BatchImportModal } from '../components/patient/BatchImportModal'
import { db } from '../db'
import { isDevModeEnabled, setDevModeEnabled, getOverrideDate, setOverrideDate } from '../utils/devmode'
import { today, realToday } from '../utils/date'
import { generateDailyTasks } from '../engine/task-generator'
import { createBackupV3, importBackup, parseBackup, type ImportPreview } from '../services/backup-service'
import { BUILT_IN_EVENT_IDS } from '../utils/id'
import Dexie from 'dexie'
import { LEGACY_DB_NAME } from '../db'

export function SettingsPage() {
  const [showClearDialog, setShowClearDialog] = useState(false)
  const [showBatchImport, setShowBatchImport] = useState(false)
  const [devMode, setDevMode] = useState(() => isDevModeEnabled())
  const [overrideDate, setOverrideDateState] = useState(() => getOverrideDate() || realToday())
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [importMode, setImportMode] = useState<'restore' | 'merge'>('restore')
  const [importResolutions, setImportResolutions] = useState<Record<string, string>>({})
  const [importing, setImporting] = useState(false)

  const handleExport = async () => {
    try {
      const data = await createBackupV3()
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
        const preview = parseBackup(text)
        setImportPreview(preview)
        setImportMode(preview.allowedModes.includes('merge') ? 'merge' : 'restore')
        setImportResolutions({})
      } catch (err) {
        console.error('Import failed:', err)
        alert('导入失败，请检查文件格式')
      }
    }
    input.click()
  }

  const commitImport = async () => {
    if (!importPreview) return
    if (importPreview.orphans.some(orphan => !importResolutions[orphan.legacyPatientEventId])) {
      alert('请先完成所有悬空事件映射')
      return
    }
    const countText = Object.entries(importPreview.counts).map(([name, count]) => `${name} ${count}`).join('、')
    const action = importMode === 'restore' ? '替换当前全部业务数据' : '安全合并到当前数据'
    if (!window.confirm(`即将${action}：${countText}。是否继续？`)) return
    setImporting(true)
    try {
      const result = await importBackup(importPreview, importMode, importResolutions)
      alert(`导入完成：新增 ${result.added}，更新 ${result.updated}，跳过 ${result.skipped}，冲突处理 ${result.conflicts}`)
      window.location.reload()
    } catch (err) {
      console.error('Import failed:', err)
      alert(`导入失败，数据库未提交：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setImporting(false)
    }
  }

  const handleClearAll = async () => {
    await Promise.all([
      db.patients.clear(),
      db.tasks.clear(),
      db.eventTypes.clear(),
      db.eventRanges.clear(),
      db.eventRangeTasks.clear(),
      db.patientEvents.clear(),
      db.onceTaskCompletions.clear(),
      db.meta.clear(),
    ])
    await db.meta.put({ key: 'legacy-migration-complete', value: { clearedAt: Date.now() }, updatedAt: Date.now() })
    window.location.reload()
  }

  const handleDeleteLegacy = async () => {
    if (!window.confirm('确定删除旧数据库？删除后将无法用旧库回滚，建议先导出 v3 备份。')) return
    await Dexie.delete(LEGACY_DB_NAME)
    alert('旧数据库已删除；当前稳定数据库未受影响。')
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
        {importPreview && (
          <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-4">
            <p className="font-medium text-sm text-gray-900">导入预览 · v{importPreview.sourceVersion}</p>
            <p className="text-xs text-gray-500 mt-1">
              {Object.entries(importPreview.counts).map(([name, count]) => `${name} ${count}`).join(' · ')}
            </p>
            {importPreview.warnings.map(warning => <p key={warning} className="text-xs text-amber-700 mt-2">⚠️ {warning}</p>)}
            {importPreview.allowedModes.length > 1 && (
              <div className="mt-3 flex gap-2">
                <button onClick={() => setImportMode('merge')} className={`flex-1 py-2 rounded-lg text-sm ${importMode === 'merge' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>安全合并</button>
                <button onClick={() => setImportMode('restore')} className={`flex-1 py-2 rounded-lg text-sm ${importMode === 'restore' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>完整恢复</button>
              </div>
            )}
            {importPreview.orphans.map(orphan => (
              <label key={orphan.legacyPatientEventId} className="block mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <span className="block text-sm">{orphan.patientName} · {orphan.eventDate}</span>
                <span className="block text-xs text-amber-700">旧事件类型 ID {orphan.missingEventTypeId} 已悬空</span>
                <select
                  value={importResolutions[orphan.legacyPatientEventId] || ''}
                  onChange={event => setImportResolutions(current => ({ ...current, [orphan.legacyPatientEventId]: event.target.value }))}
                  className="mt-2 w-full border border-gray-300 rounded px-2 py-2 text-sm bg-white"
                >
                  <option value="">请选择实际类型</option>
                  <option value={BUILT_IN_EVENT_IDS.admission}>🏥 入院</option>
                  <option value={BUILT_IN_EVENT_IDS.surgery}>🔪 手术</option>
                  <option value={BUILT_IN_EVENT_IDS.discharge}>🏠 出院</option>
                </select>
              </label>
            ))}
            <div className="flex gap-2 mt-3">
              <button onClick={() => setImportPreview(null)} className="flex-1 py-2 rounded-lg bg-gray-100 text-sm">取消</button>
              <button disabled={importing} onClick={commitImport} className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50">{importing ? '导入中…' : '确认导入'}</button>
            </div>
          </div>
        )}
        <button
          onClick={() => setShowClearDialog(true)}
          className="w-full py-3 text-left px-4 bg-white rounded-lg shadow-sm border border-red-100 text-red-600 hover:bg-red-50 transition-colors"
        >
          🗑 清空所有数据
        </button>
        <button
          onClick={handleDeleteLegacy}
          className="w-full py-3 text-left px-4 bg-white rounded-lg shadow-sm border border-amber-100 text-amber-700 hover:bg-amber-50 transition-colors"
        >
          🧹 删除旧版回滚数据库
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
