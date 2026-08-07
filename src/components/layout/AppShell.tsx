import { usePWAUpdate } from '../../hooks/usePWAUpdate'
import { BottomNav } from './BottomNav'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { needRefresh, updateServiceWorker } = usePWAUpdate()

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
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
