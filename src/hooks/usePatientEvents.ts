import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { PatientEvent, EventType } from '../types/event'

export function usePatientEvents(patientId: number): {
  events: PatientEvent[]
  eventTypes: Map<number, EventType>
  loading: boolean
} {
  const data = useLiveQuery(
    async () => {
      const events = await db.patientEvents
        .where('patientId')
        .equals(patientId)
        .toArray()

      const eventTypeIds = [...new Set(events.map(e => e.eventTypeId))]
      const types = await db.eventTypes.bulkGet(eventTypeIds)
      const typeMap = new Map<number, EventType>()
      for (const t of types) {
        if (t) typeMap.set(t.id!, t)
      }

      return { events, typeMap }
    },
    [patientId]
  )

  return {
    events: data?.events || [],
    eventTypes: data?.typeMap || new Map(),
    loading: data === undefined,
  }
}

export function useAllPatientEvents(): {
  events: PatientEvent[]
  loading: boolean
} {
  const events = useLiveQuery(
    () => db.patientEvents.toArray(),
    []
  )

  return {
    events: events || [],
    loading: events === undefined,
  }
}
