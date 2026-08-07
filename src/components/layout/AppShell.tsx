import { useState, useEffect } from 'react'
import { usePWAUpdate } from '../../hooks/usePWAUpdate'
import { isDevModeEnabled } from '../../utils/devmode'
import { today, realToday } from '../../utils/date'
import { BottomNav } from './BottomNav'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { needRefresh, updateServiceWorker } = usePWAUpdate()
  const [devMode, setDevMode] = useState(false)

  useEffect(() => {
    setDevMode(isDevModeEnabled())
    const onStorage = () => setDevMode(isDevModeEnabled())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* 开发模式提示条 */}
      {devMode && (
        <div className="sticky top-0 z-30 bg-orange-500 text-white px-4 py-1.5 text-center text-xs font-medium">
          🛠 开发模式 · 模拟日期: {today()}（真实: {realToday()}）
        </div>
      )}

      {children}

      {/* PWA 更新提示 */}
      {needRefresh && (
        <div className="fixed bottom-20 left-4 right-4 bg-blue-600 text-white px-4 py-3 rounded-xl shadow-lg flex items-center justify-between z-40">
          <span className="text-sm font-medium">发现新版本</span>
          <button
            onClick={updateServiceWorker}
            className="px-3 py-1.5 bg-white text-blue-600 text-sm font-medium rounded-lg"
          >
            更新
          </button>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
