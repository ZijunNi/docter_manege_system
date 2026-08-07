import { Header } from '../components/layout/Header'
import { ArchiveList } from '../components/patient/ArchiveList'
import { useArchivedPatients } from '../hooks/usePatients'

export function ArchivePage() {
  const { patients, loading } = useArchivedPatients()

  return (
    <div>
      <Header title="归档患者" />
      <ArchiveList patients={patients} loading={loading} />
    </div>
  )
}
