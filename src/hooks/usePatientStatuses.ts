import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { ActiveStatus } from '../types/event'
import { getActiveStatuses, getPrimaryStatus } from '../engine/state-machine'
import { today } from '../utils/date'

export function usePatientStatuses(patientId: string): {
  statuses: ActiveStatus[]
  primary: ActiveStatus | null
  loading: boolean
} {
  const data = useLiveQuery(
    async () => {
      const patient = await db.patients.get(patientId)
      if (!patient) return { statuses: [], primary: null }

      const [eventTypes, eventRanges, patientEvents] = await Promise.all([
        db.eventTypes.toArray().then(all => all.filter(et => et.isActive)),
        db.eventRanges.toArray(),
        db.patientEvents.where('patientId').equals(patientId).toArray(),
      ])

      const date = today()
      const statuses = getActiveStatuses(patient, patientEvents, eventTypes, eventRanges, date)
      const primary = getPrimaryStatus(patient, patientEvents, eventTypes, eventRanges, date)

      return { statuses, primary }
    },
    [patientId]
  )

  return {
    statuses: data?.statuses || [],
    primary: data?.primary || null,
    loading: data === undefined,
  }
}

export function useAllPatientStatuses(patientIds: string[]): {
  statusMap: Map<string, ActiveStatus[]>
  primaryMap: Map<string, ActiveStatus | null>
  loading: boolean
} {
  const data = useLiveQuery(
    async () => {
      const [patients, eventTypes, eventRanges, allPatientEvents] = await Promise.all([
        db.patients.where('isArchived').equals(0).toArray(),
        db.eventTypes.toArray().then(all => all.filter(et => et.isActive)),
        db.eventRanges.toArray(),
        db.patientEvents.toArray(),
      ])

      const date = today()
      const statusMap = new Map<string, ActiveStatus[]>()
      const primaryMap = new Map<string, ActiveStatus | null>()

      for (const patient of patients) {
        if (!patient.id) continue
        const patientEvents = allPatientEvents.filter(pe => pe.patientId === patient.id)
        const statuses = getActiveStatuses(patient, patientEvents, eventTypes, eventRanges, date)
        const primary = statuses.length > 0 ? statuses[0] : null

        statusMap.set(patient.id, statuses)
        primaryMap.set(patient.id, primary)
      }

      return { statusMap, primaryMap }
    },
    [patientIds]
  )

  return {
    statusMap: data?.statusMap || new Map(),
    primaryMap: data?.primaryMap || new Map(),
    loading: data === undefined,
  }
}
