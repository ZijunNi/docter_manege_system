import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { buildLegacyDraft } from '../src/services/migration-service'
import { BUILT_IN_EVENT_IDS } from '../src/utils/id'

const patient = (id: number) => ({
  id, name: `患者${id}`, admissionDate: '2026-08-08', isArchived: 0,
  createdAt: 1, updatedAt: 1,
})

describe('旧数字 ID 迁移', () => {
  it('不同设备的手术数字 ID 都映射到同一稳定 ID', () => {
    const first = buildLegacyDraft({
      patients: [patient(1)], tasks: [],
      eventTypes: [{ id: 2, key: 'surgery', name: '手术', updatedAt: 1 }],
      eventRanges: [], rangeTasks: [],
      patientEvents: [{ id: 10, patientId: 1, eventTypeId: 2, eventDate: '2026-08-13' }],
    })
    const second = buildLegacyDraft({
      patients: [patient(99)], tasks: [],
      eventTypes: [{ id: 18, key: 'surgery', name: '手术', updatedAt: 1 }],
      eventRanges: [], rangeTasks: [],
      patientEvents: [{ id: 20, patientId: 99, eventTypeId: 18, eventDate: '2026-08-13' }],
    })
    expect(first.patientEvents[0].eventTypeId).toBe(BUILT_IN_EVENT_IDS.surgery)
    expect(second.patientEvents[0].eventTypeId).toBe(BUILT_IN_EVENT_IDS.surgery)
  })

  it('合并重复内置事件，并把其患者事件统一映射到稳定 ID', () => {
    const draft = buildLegacyDraft({
      patients: [patient(1)], tasks: [],
      eventTypes: [
        { id: 2, key: 'surgery', name: '旧手术', updatedAt: 1 },
        { id: 18, key: 'surgery', name: '当前手术', updatedAt: 2 },
      ],
      eventRanges: [], rangeTasks: [],
      patientEvents: [{ id: 10, patientId: 1, eventTypeId: 2, eventDate: '2026-08-13' }],
    })
    expect(draft.eventTypes.filter(type => type.key === 'surgery')).toHaveLength(1)
    expect(draft.patientEvents[0].eventTypeId).toBe(BUILT_IN_EVENT_IDS.surgery)
  })

  it('不推测悬空 eventTypeId，并要求人工修复', () => {
    const draft = buildLegacyDraft({
      patients: [{ ...patient(100013), name: '金丹阳' }], tasks: [],
      eventTypes: [
        { id: 17, key: 'admission', name: '入院' },
        { id: 18, key: 'surgery', name: '手术' },
      ],
      eventRanges: [], rangeTasks: [],
      patientEvents: [{ id: 2000001, patientId: 100013, eventTypeId: 2, eventDate: '2026-08-13' }],
    })
    expect(draft.patientEvents).toHaveLength(0)
    expect(draft.orphanRows[0].orphan).toMatchObject({
      patientName: '金丹阳', eventDate: '2026-08-13', missingEventTypeId: '2',
    })
  })
})
