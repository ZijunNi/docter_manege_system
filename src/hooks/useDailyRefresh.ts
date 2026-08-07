import { useEffect, useState, useCallback, useRef } from 'react'
import { generateDailyTasks } from '../engine/task-generator'

export function useDailyRefresh(): {
  isRefreshing: boolean
  refreshNow: () => Promise<void>
} {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const refreshingRef = useRef(false)

  const doRefresh = useCallback(async () => {
    // 防止并发刷新（React StrictMode 会双重调用 useEffect）
    if (refreshingRef.current) return
    refreshingRef.current = true
    setIsRefreshing(true)
    try {
      await generateDailyTasks()
    } catch (err) {
      console.error('Daily refresh failed:', err)
    } finally {
      refreshingRef.current = false
      setIsRefreshing(false)
    }
  }, [])

  // 每次进入首页时自动刷新
  useEffect(() => {
    doRefresh()
  }, [doRefresh])

  // 从后台切回前台时也刷新
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        doRefresh()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [doRefresh])

  return {
    isRefreshing,
    refreshNow: doRefresh,
  }
}
