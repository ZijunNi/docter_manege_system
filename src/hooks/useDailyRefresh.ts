import { useEffect, useState, useCallback } from 'react'
import { generateDailyTasks } from '../engine/task-generator'
import { today } from '../utils/date'

const LAST_REFRESH_KEY = 'lastDailyRefreshDate'

export function useDailyRefresh(): {
  isRefreshing: boolean
  lastRefreshDate: string | null
  refreshNow: () => Promise<void>
} {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefreshDate, setLastRefreshDate] = useState<string | null>(
    () => localStorage.getItem(LAST_REFRESH_KEY)
  )

  const doRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await generateDailyTasks()
      const todayStr = today()
      localStorage.setItem(LAST_REFRESH_KEY, todayStr)
      setLastRefreshDate(todayStr)
    } catch (err) {
      console.error('Daily refresh failed:', err)
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const todayStr = today()

    // 首次加载时检查是否需要刷新
    if (lastRefreshDate !== todayStr) {
      doRefresh()
    }

    // 从后台切回前台时检查
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const currentDate = today()
        if (localStorage.getItem(LAST_REFRESH_KEY) !== currentDate) {
          doRefresh()
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [lastRefreshDate, doRefresh])

  return {
    isRefreshing,
    lastRefreshDate,
    refreshNow: doRefresh,
  }
}
