import { useState, useEffect } from 'react'

export function usePWAUpdate(): {
  needRefresh: boolean
  updateServiceWorker: () => void
} {
  const [needRefresh, setNeedRefresh] = useState(false)

  useEffect(() => {
    // 仅在生产环境检测 PWA 更新
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      const swPath = '/sw.js'

      const checkUpdate = async () => {
        try {
          const registration = await navigator.serviceWorker.getRegistration()
          if (registration && registration.waiting) {
            setNeedRefresh(true)
          }
        } catch {
          // 忽略检测错误
        }
      }

      checkUpdate()

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload()
      })
    }
  }, [])

  const updateServiceWorker = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        }
      })
    }
    window.location.reload()
  }

  return { needRefresh, updateServiceWorker }
}
