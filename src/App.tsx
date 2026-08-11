import { useState, useEffect } from 'react'
import { AppRouter } from './router'
import { completeLegacyMigration, initializeDatabase, type InitializationResult } from './services/migration-service'

function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [repair, setRepair] = useState<Extract<InitializationResult, { status: 'needs-repair' }> | null>(null)
  const [resolutions, setResolutions] = useState<Record<string, string>>({})
  const [migrating, setMigrating] = useState(false)

  useEffect(() => {
    initializeDatabase()
      .then(result => {
        if (result.status === 'needs-repair') setRepair(result)
        else setReady(true)
      })
      .catch(err => {
        console.error('Seed data failed:', err)
        setError(String(err))
      })
  }, [])

  const submitRepair = async () => {
    if (!repair || repair.orphans.some(orphan => !resolutions[orphan.legacyPatientEventId])) return
    setMigrating(true)
    setError(null)
    try {
      await completeLegacyMigration(resolutions)
      setRepair(null)
      setReady(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setMigrating(false)
    }
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <p className="text-red-500 font-medium mb-2">初始化失败</p>
          <p className="text-sm text-gray-500">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  if (repair) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <div className="w-full max-w-lg bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h1 className="text-lg font-bold text-gray-900">修复旧数据库事件引用</h1>
          <p className="text-sm text-gray-500 mt-2">
            以下事件引用了旧库中不存在的事件类型。请选择实际类型后才能原子迁移；旧数据库会保留用于回滚。
          </p>
          <div className="mt-4 flex flex-col gap-3">
            {repair.orphans.map(orphan => (
              <label key={orphan.legacyPatientEventId} className="border border-amber-200 bg-amber-50 rounded-lg p-3">
                <span className="block text-sm font-medium text-gray-900">
                  {orphan.patientName} · {orphan.eventDate}
                </span>
                <span className="block text-xs text-amber-700 mt-1">缺失的旧事件类型 ID：{orphan.missingEventTypeId}</span>
                <select
                  value={resolutions[orphan.legacyPatientEventId] || ''}
                  onChange={event => setResolutions(current => ({ ...current, [orphan.legacyPatientEventId]: event.target.value }))}
                  className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">请选择实际事件类型</option>
                  {repair.eventTypes.map(type => <option key={type.id} value={type.id}>{type.icon} {type.name}</option>)}
                </select>
              </label>
            ))}
          </div>
          <button
            onClick={submitRepair}
            disabled={migrating || repair.orphans.some(orphan => !resolutions[orphan.legacyPatientEventId])}
            className="mt-4 w-full rounded-lg bg-blue-600 text-white py-2.5 text-sm font-medium disabled:opacity-50"
          >
            {migrating ? '正在迁移…' : '确认映射并迁移'}
          </button>
        </div>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">正在初始化...</p>
        </div>
      </div>
    )
  }

  return <AppRouter />
}

export default App
