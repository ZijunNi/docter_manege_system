import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, ensureSeedData } from '../src/db'
import { createBackupV3, importBackup, parseBackup } from '../src/services/backup-service'
import { generateTasksForPatient } from '../src/engine/task-generator'
import { toggleTaskComplete } from '../src/services/task-service'
import { BUILT_IN_EVENT_IDS } from '../src/utils/id'
import type { Patient } from '../src/types/patient'
import { repairDuplicatePatientEvents } from '../src/services/data-repair-service'
import { readFile } from 'node:fs/promises'

const patient: Patient = {
  id: 'patient:test', name: '测试患者', admissionDate: '2026-08-01', isArchived: 0,
  createdAt: 1, updatedAt: 1,
}

beforeEach(async () => {
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    },
  })
  await db.delete()
  await db.open()
  await ensureSeedData()
})

describe('稳定数据库集成行为', () => {
  it('导入 converted-v2 样例后，每位患者只保留一组当天任务', async () => {
    localStorage.setItem('devModeEnabled', 'true')
    localStorage.setItem('devModeOverrideDate', '2026-08-11')
    const text = await readFile(
      new URL('../test_data/resident-schedule-backup-2026-08-11-converted-v2.json', import.meta.url),
      'utf8',
    )
    const preview = parseBackup(text)
    expect(preview.orphans).toHaveLength(1)
    await importBackup(preview, 'restore', {
      [preview.orphans[0].legacyPatientEventId]: BUILT_IN_EVENT_IDS.surgery,
    })

    const patients = await db.patients.toArray()
    const currentTasks = await db.tasks.where('date').equals('2026-08-11').toArray()
    expect(patients).toHaveLength(5)
    expect(currentTasks).toHaveLength(8)
    expect(currentTasks.filter(task => task.isHistoricalImport)).toHaveLength(0)
    const inpatientTasks = currentTasks.filter(task => task.title === '写主治查房病程')
    expect(inpatientTasks).toHaveLength(5)
    expect(inpatientTasks.every(task => task.isCompleted)).toBe(true)

    for (const currentPatient of patients) {
      const tasks = currentTasks.filter(task => task.patientId === currentPatient.id)
      const signatures = tasks.map(task => `${task.title}\u0000${task.category}\u0000${task.statusLabel}`)
      expect(new Set(signatures).size).toBe(signatures.length)
    }
    const jin = patients.find(item => item.name === '金丹阳')!
    expect(currentTasks.filter(task => task.patientId === jin.id && task.statusLabel === '术前准备')).toHaveLength(3)
  })

  it('重复手术事件只生成一组任务，并清理已有重复来源', async () => {
    await db.patients.put(patient)
    await db.patientEvents.bulkPut([
      {
        id: 'patient-event:surgery-old', patientId: patient.id,
        eventTypeId: BUILT_IN_EVENT_IDS.surgery, eventDate: '2026-08-20', createdAt: 1, updatedAt: 1,
      },
      {
        id: 'patient-event:surgery-new', patientId: patient.id,
        eventTypeId: BUILT_IN_EVENT_IDS.surgery, eventDate: '2026-08-20', createdAt: 2, updatedAt: 2,
      },
    ])

    const generated = await generateTasksForPatient(patient, '2026-08-11')
    expect(generated.filter(task => task.statusLabel === '术前准备')).toHaveLength(3)
    expect(await repairDuplicatePatientEvents()).toBe(1)
    expect(await db.patientEvents.where('eventTypeId').equals(BUILT_IN_EVENT_IDS.surgery).count()).toBe(1)
    expect((await db.patientEvents.where('eventTypeId').equals(BUILT_IN_EVENT_IDS.surgery).first())?.id)
      .toBe('patient-event:surgery-new')
  })

  it('吸收旧迁移历史任务，不与稳定生成任务重复，并保留完成状态', async () => {
    await db.patients.put(patient)
    await db.patientEvents.put({
      id: 'patient-event:surgery-test', patientId: patient.id,
      eventTypeId: BUILT_IN_EVENT_IDS.surgery, eventDate: '2026-08-20', createdAt: 1, updatedAt: 1,
    })
    const generated = await generateTasksForPatient(patient, '2026-08-11')
    const target = generated.find(task => task.statusLabel === '术前准备' && task.isOnceOnly)!
    await db.tasks.put({
      ...target,
      id: 'task:historical-duplicate',
      sourceKey: 'historical-import:123',
      sourceEventId: undefined,
      sourceTemplateTaskId: undefined,
      isOnceOnly: false,
      isHistoricalImport: true,
      isCompleted: true,
      completedAt: 100,
    })

    await generateTasksForPatient(patient, '2026-08-11')
    const sameSignature = (await db.tasks.where('[patientId+date]').equals([patient.id, '2026-08-11']).toArray())
      .filter(task => task.title === target.title && task.statusLabel === target.statusLabel)
    expect(sameSignature).toHaveLength(1)
    expect(sameSignature[0].isCompleted).toBe(true)
    expect(await db.tasks.get('task:historical-duplicate')).toBeUndefined()
    expect(await db.onceTaskCompletions.where('patientId').equals(patient.id).count()).toBe(1)
  })

  it('一次性任务完成当天继续显示，次日不再生成，完成记录可导出', async () => {
    await db.patients.put(patient)
    await db.patientEvents.put({
      id: 'patient-event:surgery-test', patientId: patient.id,
      eventTypeId: BUILT_IN_EVENT_IDS.surgery, eventDate: '2026-08-20', createdAt: 1, updatedAt: 1,
    })

    const firstDay = await generateTasksForPatient(patient, '2026-08-11')
    const once = firstDay.find(task => task.isOnceOnly)
    expect(once).toBeDefined()
    await toggleTaskComplete(once!.id)

    const sameDay = await generateTasksForPatient(patient, '2026-08-11')
    expect(sameDay.find(task => task.id === once!.id)?.isCompleted).toBe(true)
    const nextDay = await generateTasksForPatient(patient, '2026-08-12')
    expect(nextDay.some(task => task.sourceTemplateTaskId === once!.sourceTemplateTaskId)).toBe(false)

    const backup = await createBackupV3()
    expect(backup.onceTaskCompletions).toHaveLength(1)
  })

  it('同一 v3 文件重复安全合并不产生重复实体', async () => {
    await db.patients.put(patient)
    const preview = parseBackup(JSON.stringify(await createBackupV3()))
    await importBackup(preview, 'merge')
    await importBackup(preview, 'merge')
    expect(await db.patients.count()).toBe(1)
    expect(await db.eventTypes.where('key').equals('surgery').count()).toBe(1)
  })

  it('完整恢复采用备份内置模板，安全合并保留当前内置模板', async () => {
    const templateId = 'range-task:surgery:preparation:task-1'
    await db.eventRangeTasks.update(templateId, { title: '备份中的术前签字' })
    const backup = await createBackupV3()
    const preview = parseBackup(JSON.stringify(backup))

    await db.eventRangeTasks.update(templateId, { title: '当前版本术前签字' })
    await importBackup(preview, 'merge')
    expect((await db.eventRangeTasks.get(templateId))?.title).toBe('当前版本术前签字')

    await importBackup(preview, 'restore')
    expect((await db.eventRangeTasks.get(templateId))?.title).toBe('备份中的术前签字')
  })

  it('恢复事务中约束失败时回滚，原数据库保持可用', async () => {
    await db.patients.put(patient)
    const backup = await createBackupV3()
    backup.eventTypes.push({
      ...backup.eventTypes[0], id: 'event-type:duplicate-key',
    })
    const preview = parseBackup(JSON.stringify(backup))
    await expect(importBackup(preview, 'restore')).rejects.toThrow()
    expect(await db.patients.get(patient.id)).toEqual(patient)
  })
})
