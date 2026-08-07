import { useMemo } from 'react'
import { PatientCard } from './PatientCard'
import type { Patient } from '../../types/patient'
import { useTodayAllTasks } from '../../hooks/useTasks'
import { EmptyState } from '../ui/EmptyState'
import { LoadingSpinner } from '../ui/LoadingSpinner'

interface PatientListProps {
  patients: Patient[]
  loading: boolean
  emptyMessage?: string
}

export function PatientList({ patients, loading, emptyMessage = '暂无患者' }: PatientListProps) {
  const { tasks: allTasks, loading: tasksLoading } = useTodayAllTasks()

  // 计算每个患者的任务完成数
  const taskStats = useMemo(() => {
    const map = new Map<number, { total: number; completed: number }>()
    for (const t of allTasks) {
      const entry = map.get(t.patientId) || { total: 0, completed: 0 }
      entry.total++
      if (t.isCompleted) entry.completed++
      map.set(t.patientId, entry)
    }
    return map
  }, [allTasks])

  if (loading || tasksLoading) {
    return <LoadingSpinner />
  }

  if (patients.length === 0) {
    return <EmptyState title={emptyMessage} description="点击底部「添加」按钮新增患者" />
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      {patients.map(patient => {
        const stats = taskStats.get(patient.id!)
        return (
          <PatientCard
            key={patient.id}
            patient={patient}
            completedCount={stats?.completed || 0}
            totalCount={stats?.total || 0}
          />
        )
      })}
    </div>
  )
}
