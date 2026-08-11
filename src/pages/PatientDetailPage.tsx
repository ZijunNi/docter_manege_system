import { useParams, useNavigate } from 'react-router-dom'
import { Header } from '../components/layout/Header'
import { PatientDetail } from '../components/patient/PatientDetail'
import { usePatient } from '../hooks/usePatients'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { EmptyState } from '../components/ui/EmptyState'

export function PatientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { patient, loading } = usePatient(id || '')

  return (
    <div>
      <Header title="患者详情" showBack onBack={() => navigate('/')} />
      {loading ? (
        <LoadingSpinner />
      ) : patient ? (
        <PatientDetail patient={patient} />
      ) : (
        <EmptyState title="患者未找到" description="该患者可能已被删除" />
      )}
    </div>
  )
}
