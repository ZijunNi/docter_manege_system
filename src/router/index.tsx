import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { HomePage } from '../pages/HomePage'
import { PatientDetailPage } from '../pages/PatientDetailPage'
import { AddPatientPage } from '../pages/AddPatientPage'
import { EditPatientPage } from '../pages/EditPatientPage'
import { ArchivePage } from '../pages/ArchivePage'
import { SettingsPage } from '../pages/SettingsPage'

export function AppRouter() {
  return (
    <HashRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/patient/new" element={<AddPatientPage />} />
          <Route path="/patient/:id" element={<PatientDetailPage />} />
          <Route path="/patient/:id/edit" element={<EditPatientPage />} />
          <Route path="/archive" element={<ArchivePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </HashRouter>
  )
}
