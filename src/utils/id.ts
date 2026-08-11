export type EntityId = string

export const BUILT_IN_EVENT_IDS = {
  admission: 'event-type:admission',
  surgery: 'event-type:surgery',
  discharge: 'event-type:discharge',
  temporary: 'event-type:temporary',
} as const

export function createEntityId(prefix: string): EntityId {
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : fallbackUuid()
  return `${prefix}:${uuid}`
}

function fallbackUuid(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
}

export function stableRangeId(eventKey: string, rangeKey: string): EntityId {
  return `event-range:${eventKey}:${rangeKey}`
}

export function stableRangeTaskId(eventKey: string, rangeKey: string, taskKey: string): EntityId {
  return `range-task:${eventKey}:${rangeKey}:${taskKey}`
}

export function deterministicTaskId(patientId: string, date: string, sourceKey: string): EntityId {
  return `task:${encodeURIComponent(patientId)}:${date}:${encodeURIComponent(sourceKey)}`
}

export function onceCompletionId(patientId: string, sourceKey: string): EntityId {
  return `once-completion:${encodeURIComponent(patientId)}:${encodeURIComponent(sourceKey)}`
}
