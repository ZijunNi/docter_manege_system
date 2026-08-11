import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { assertIntegrity, parseBackup, type BackupV3 } from '../src/services/backup-service'

function emptyBackup(): BackupV3 {
  return {
    version: 3, schemaVersion: 2, exportId: 'export:test', exportedAt: new Date(0).toISOString(),
    patients: [], tasks: [], eventTypes: [], eventRanges: [], eventRangeTasks: [],
    patientEvents: [], onceTaskCompletions: [],
  }
}

describe('v3 备份校验', () => {
  it('v3 同时允许完整恢复和安全合并', () => {
    const preview = parseBackup(JSON.stringify(emptyBackup()))
    expect(preview.allowedModes).toEqual(['restore', 'merge'])
  })

  it('导出或导入前阻止悬空患者事件', () => {
    const backup = emptyBackup()
    backup.patientEvents.push({
      id: 'patient-event:test', patientId: 'patient:missing', eventTypeId: 'event-type:missing',
      eventDate: '2026-08-13', createdAt: 1, updatedAt: 1,
    })
    expect(() => assertIntegrity(backup)).toThrow('引用完整性检查失败')
  })

  it('v2 只允许完整恢复', () => {
    const preview = parseBackup(JSON.stringify({ version: 2, patients: [], tasks: [] }))
    expect(preview.allowedModes).toEqual(['restore'])
  })
})
