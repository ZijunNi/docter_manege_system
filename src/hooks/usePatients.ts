import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Patient } from '../types/patient'

export function usePatients(): {
  patients: Patient[]
  loading: boolean
  refresh: () => void
} {
  const patients = useLiveQuery(
    () => db.patients
      .where('isArchived')
      .equals(0)
      .reverse()
      .sortBy('createdAt'),
    []
  )

  return {
    patients: patients || [],
    loading: patients === undefined,
    refresh: () => {},
  }
}

export function useArchivedPatients(): {
  patients: Patient[]
  loading: boolean
} {
  const patients = useLiveQuery(
    () => db.patients
      .where('isArchived')
      .equals(1)
      .reverse()
      .sortBy('createdAt'),
    []
  )

  return {
    patients: patients || [],
    loading: patients === undefined,
  }
}

export function usePatient(id: number): {
  patient: Patient | undefined
  loading: boolean
} {
  const patient = useLiveQuery(
    () => db.patients.get(id),
    [id]
  )

  return {
    patient,
    loading: patient === undefined,
  }
}
