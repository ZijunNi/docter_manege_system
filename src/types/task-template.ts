import type { PatientStatus, TaskCategory, SurgeryPhase, HolidayRule } from './enums'

export interface TaskTemplate {
  id?: number
  key: string
  title: string
  description?: string
  patientStatus: PatientStatus
  category: TaskCategory
  weekday: number | null
  surgeryPhase: SurgeryPhase | null
  isHolidayDependent: boolean
  holidayRule: HolidayRule | null
  dayOffsetFromAdmission: number | null
  dayOffsetFromSurgery: number | null
  dayOffsetFromDischarge: number | null
  order: number
  isActive: boolean
  isOnceOnly: boolean
}
