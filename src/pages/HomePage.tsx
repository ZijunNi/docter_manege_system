import { Header } from '../components/layout/Header'
import { PatientList } from '../components/patient/PatientList'
import { usePatients } from '../hooks/usePatients'
import { useDailyRefresh } from '../hooks/useDailyRefresh'
import { today, getWeekdayLabel } from '../utils/date'

export function HomePage() {
  const { patients, loading } = usePatients()
  const { isRefreshing, refreshNow } = useDailyRefresh()

  const dateLabel = `${today()} ${getWeekdayLabel(today())}`

  return (
    <div>
      <Header
        title="住院医师日程管家"
        rightAction={
          <button
            onClick={refreshNow}
            disabled={isRefreshing}
            className="text-sm text-blue-600 font-medium disabled:opacity-50"
          >
            {isRefreshing ? '刷新中...' : '🔄 刷新'}
          </button>
        }
      />
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
        <p className="text-xs text-gray-500">{dateLabel}</p>
      </div>
      <PatientList patients={patients} loading={loading} emptyMessage="暂无在院患者" />
    </div>
  )
}
