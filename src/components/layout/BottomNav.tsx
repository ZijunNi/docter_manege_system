import { useLocation, useNavigate } from 'react-router-dom'
import { cn } from '../../utils/cn'

const NAV_ITEMS = [
  { path: '/', label: '患者', icon: '👥' },
  { path: '/patient/new', label: '添加', icon: '＋' },
  { path: '/archive', label: '归档', icon: '📁' },
  { path: '/settings', label: '设置', icon: '⚙️' },
]

export function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-2 py-1.5 flex justify-around items-center z-30 safe-area-bottom">
      {NAV_ITEMS.map(item => {
        const isActive = item.path === '/'
          ? location.pathname === '/'
          : location.pathname.startsWith(item.path)
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={cn(
              'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors min-w-[60px]',
              isActive ? 'text-blue-600' : 'text-gray-400'
            )}
          >
            <span className="text-xl">{item.icon}</span>
            <span className="text-xs font-medium">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
