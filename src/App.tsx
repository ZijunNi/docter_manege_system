import { useState, useEffect } from 'react'
import { AppRouter } from './router'
import { ensureSeedData } from './db'

function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ensureSeedData()
      .then(() => setReady(true))
      .catch(err => {
        console.error('Seed data failed:', err)
        setError(String(err))
      })
  }, [])

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
