import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { EventType, EventRange, EventRangeTask } from '../types/event'

export function useActiveEventTypes(): {
  eventTypes: EventType[]
  loading: boolean
} {
  const eventTypes = useLiveQuery(
    async () => {
      // `order` is a display field, not an IndexedDB index. Sort in memory so
      // Dexie does not throw SchemaError on pages that consume this hook.
      const all = await db.eventTypes.toArray()
      return all
        .filter(et => et.isActive)
        .sort((a, b) => a.order - b.order)
    },
    []
  )

  return {
    eventTypes: eventTypes || [],
    loading: eventTypes === undefined,
  }
}

export function useAllEventTypes(): {
  eventTypes: EventType[]
  loading: boolean
} {
  const eventTypes = useLiveQuery(
    async () => {
      const all = await db.eventTypes.toArray()
      return all.sort((a, b) => a.order - b.order)
    },
    []
  )

  return {
    eventTypes: eventTypes || [],
    loading: eventTypes === undefined,
  }
}

export interface EventTypeDetail {
  eventType: EventType
  ranges: Array<{
    range: EventRange
    tasks: EventRangeTask[]
  }>
}

export function useEventTypeDetail(id: string | undefined): {
  detail: EventTypeDetail | undefined
  loading: boolean
} {
  const detail = useLiveQuery(
    async () => {
      if (!id) return undefined
      const eventType = await db.eventTypes.get(id)
      if (!eventType) return undefined

      const ranges = await db.eventRanges
        .where('eventTypeId')
        .equals(id)
        .sortBy('order')

      const rangesWithTasks = await Promise.all(
        ranges.map(async (range) => {
          const tasks = await db.eventRangeTasks
            .where('eventRangeId')
            .equals(range.id!)
            .sortBy('order')
          return { range, tasks }
        })
      )

      return { eventType, ranges: rangesWithTasks }
    },
    [id]
  )

  return {
    detail,
    loading: detail === undefined && id !== undefined,
  }
}
