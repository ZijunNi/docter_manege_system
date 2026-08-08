import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '../components/layout/Header'
import { PatientForm } from '../components/patient/PatientForm'
import type { PatientInput } from '../types/patient'
import type { EventAssignment } from '../components/patient/PatientForm'
import { addPatient } from '../services/patient-service'
import { addPatientEvent } from '../services/event-service'
import { generateDailyTasks } from '../engine/task-generator'

export function AddPatientPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (data: PatientInput, events: EventAssignment[]) => {
    setError(null)
    setSubmitting(true)
    try {
      const patient = await addPatient(data)

      // 创建事件实例
      for (const evt of events) {
        await addPatientEvent(patient.id!, evt.eventTypeId, evt.eventDate)
      }

      // 重新生成任务以反映事件
      await generateDailyTasks()

      navigate(`/patient/${patient.id}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('Failed to add patient:', err)
      setError(`添加失败: ${message}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <Header title="添加患者" showBack onBack={() => navigate('/')} />
      <div className="px-4 py-4">
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}
        <PatientForm
          onSubmit={handleSubmit}
          onCancel={() => navigate('/')}
          submitLabel={submitting ? '添加中...' : '添加患者'}
          disabled={submitting}
        />
      </div>
    </div>
  )
}
