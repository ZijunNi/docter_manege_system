import { PatientCard } from './PatientCard'
import type { Patient } from '../../types/patient'
import { EmptyState } from '../ui/EmptyState'
import { LoadingSpinner } from '../ui/LoadingSpinner'

interface ArchiveListProps {
  patients: Patient[]
  loading: boolean
}

export function ArchiveList({ patients, loading }: ArchiveListProps) {
  if (loading) return <LoadingSpinner />

  if (patients.length === 0) {
    return <EmptyState title="暂无归档患者" description="已出院的患者会自动显示在这里" />
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      {patients.map(patient => (
        <PatientCard key={patient.id} patient={patient} />
      ))}
    </div>
  )
}
