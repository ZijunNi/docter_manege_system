import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Header } from '../components/layout/Header'
import { PatientForm } from '../components/patient/PatientForm'
import { usePatient } from '../hooks/usePatients'
import { usePatientEvents } from '../hooks/usePatientEvents'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { EmptyState } from '../components/ui/EmptyState'
import type { PatientInput } from '../types/patient'
import type { EventAssignment } from '../components/patient/PatientForm'
import { updatePatient } from '../services/patient-service'
import { addPatientEvent, removePatientEventByType } from '../services/event-service'
import { generateDailyTasks } from '../engine/task-generator'

export function EditPatientPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const patientId = id || ''
  const { patient, loading: patientLoading } = usePatient(patientId)
  const { events: currentEvents, loading: eventsLoading } = usePatientEvents(patientId)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (patientLoading || eventsLoading) {
    return (
      <div>
        <Header title="编辑患者" showBack onBack={() => navigate(-1)} />
        <LoadingSpinner />
      </div>
    )
  }

  if (!patient) {
    return (
      <div>
        <Header title="编辑患者" showBack onBack={() => navigate(-1)} />
        <EmptyState title="患者未找到" />
      </div>
    )
  }

  const initial: PatientInput = {
    name: patient.name,
    bedNumber: patient.bedNumber,
    admissionDate: patient.admissionDate,
    notes: patient.notes,
  }

  const handleSubmit = async (data: PatientInput, newEvents: EventAssignment[]) => {
    setError(null)
    setSubmitting(true)
    try {
      // 更新患者基本信息
      await updatePatient(patientId, data)

      // 对比新旧事件，进行增/改/删
      const oldEventTypeIds = new Set(currentEvents.map(pe => pe.eventTypeId))
      const newEventMap = new Map(newEvents.map(e => [e.eventTypeId, e.eventDate]))
      const newEventTypeIds = new Set(newEvents.map(e => e.eventTypeId))

      // 移除已取消的事件
      for (const oldPe of currentEvents) {
        if (!newEventTypeIds.has(oldPe.eventTypeId)) {
          await removePatientEventByType(patientId, oldPe.eventTypeId)
        }
      }

      // 添加或更新事件
      for (const [eventTypeId, eventDate] of newEventMap) {
        await addPatientEvent(patientId, eventTypeId, eventDate)
      }

      // 刷新任务
      await generateDailyTasks()

      navigate(`/patient/${id}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('Failed to update patient:', err)
      setError(`更新失败: ${message}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <Header title="编辑患者" showBack onBack={() => navigate(-1)} />
      <div className="px-4 py-4">
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}
        <PatientForm
          initial={initial}
          initialEvents={currentEvents}
          onSubmit={handleSubmit}
          onCancel={() => navigate(-1)}
          submitLabel={submitting ? '保存中...' : '保存修改'}
          disabled={submitting}
        />
      </div>
    </div>
  )
}
