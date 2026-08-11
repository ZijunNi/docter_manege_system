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
    const map = new Map<string, { total: number; completed: number }>()
    for (const t of allTasks) {
      const entry = map.get(t.patientId) || { total: 0, completed: 0 }
      entry.total++
      if (t.isCompleted) entry.completed++
      map.set(t.patientId, entry)
    }
    return map
  }, [allTasks])

  // 排序：今日任务全部完成的患者排到最后，其余患者保持原有排序
  const sortedPatients = useMemo(() => {
    const allDone = new Set<string>()
    const notAllDone: Patient[] = []
    const donePatients: Patient[] = []
    for (const p of patients) {
      const stats = taskStats.get(p.id!)
      if (stats && stats.total > 0 && stats.total === stats.completed) {
        donePatients.push(p)
      } else {
        notAllDone.push(p)
      }
    }
    return [...notAllDone, ...donePatients]
  }, [patients, taskStats])

  if (loading || tasksLoading) {
    return <LoadingSpinner />
  }

  if (patients.length === 0) {
    return <EmptyState title={emptyMessage} description="点击底部「添加」按钮新增患者" />
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      {sortedPatients.map(patient => {
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
