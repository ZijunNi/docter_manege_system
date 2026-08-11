import { db } from '../db'
import type { Patient } from '../types/patient'
import type { Task } from '../types/task'
import type { EventType, EventRange, EventRangeTask, PatientEvent } from '../types/event'
import { getActiveStatuses } from './state-machine'
import { today, getWeekday } from '../utils/date'
import { isDayBeforeHoliday, isNonWorkday, isWorkday } from './holiday-utils'

// 模块级互斥锁，防止 generateDailyTasks 被并发调用
let refreshLock: Promise<void> | null = null

interface CompletedOnceRecord {
  key: string
  completedDate?: string
  completedAt?: number
}

function rangeTaskKey(task: Pick<EventRangeTask, 'eventRangeId' | 'title'>): string {
  return `range:${task.eventRangeId}:${task.title}`
}

/**
 * 兼容旧版 string[]。旧记录没有日期且可能正是被旧逻辑误删的当天任务，
 * 因此首次迁移为目标日期已完成，让仍处于活跃 range 的任务恢复显示。
 */
function readCompletedOnceRecords(
  storageKey: string,
  targetDate: string
): Map<string, CompletedOnceRecord> {
  const records = new Map<string, CompletedOnceRecord>()

  try {
    const raw: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]')
    if (!Array.isArray(raw)) return records

    for (const item of raw) {
      if (typeof item === 'string') {
        records.set(item, { key: item, completedDate: targetDate })
      } else if (item && typeof item === 'object' && 'key' in item && typeof item.key === 'string') {
        records.set(item.key, {
          key: item.key,
          completedDate: 'completedDate' in item && typeof item.completedDate === 'string'
            ? item.completedDate
            : undefined,
          completedAt: 'completedAt' in item && typeof item.completedAt === 'number'
            ? item.completedAt
            : undefined,
        })
      }
    }
  } catch {
    // 损坏的旧记录不应阻止当天任务生成。
  }

  return records
}

/**
 * 每日任务生成：为所有未归档患者生成今日任务
 * 内置互斥锁，并发调用时只会执行一次
 */
export async function generateDailyTasks(targetDate?: string): Promise<void> {
  if (refreshLock) {
    await refreshLock
    return
  }

  refreshLock = (async () => {
    const date = targetDate || today()

    // 预加载所有事件数据（一次查询替代 N 次查询）
    const [patients, eventTypes, eventRanges, allEventRangeTasks, allPatientEvents] =
      await Promise.all([
        db.patients.where('isArchived').equals(0).toArray(),
        db.eventTypes.toArray(),
        db.eventRanges.toArray(),
        db.eventRangeTasks.toArray(),
        db.patientEvents.toArray(),
      ])

    const activeEventTypes = eventTypes.filter(et => et.isActive)

    for (const patient of patients) {
      const patientEvents = allPatientEvents.filter(pe => pe.patientId === patient.id)
      await generateTasksForPatientInternal(
        patient, patientEvents, activeEventTypes, eventRanges, allEventRangeTasks, date
      )
    }
  })()

  try {
    await refreshLock
  } finally {
    refreshLock = null
  }
}

/**
 * 为单个患者生成当天的任务（对外接口）
 */
export async function generateTasksForPatient(
  patient: Patient,
  targetDate?: string
): Promise<Task[]> {
  const date = targetDate || today()

  const [eventTypes, eventRanges, allEventRangeTasks, patientEvents] = await Promise.all([
    db.eventTypes.toArray(),
    db.eventRanges.toArray(),
    db.eventRangeTasks.toArray(),
    db.patientEvents.where('patientId').equals(patient.id!).toArray(),
  ])

  const activeEventTypes = eventTypes.filter(et => et.isActive)

  return generateTasksForPatientInternal(
    patient, patientEvents, activeEventTypes, eventRanges, allEventRangeTasks, date
  )
}

/**
 * 核心：为单个患者在某日期生成任务
 */
async function generateTasksForPatientInternal(
  patient: Patient,
  patientEvents: PatientEvent[],
  activeEventTypes: EventType[],
  eventRanges: EventRange[],
  allEventRangeTasks: EventRangeTask[],
  date: string
): Promise<Task[]> {
  // 计算该患者的所有活跃状态
  const activeStatuses = getActiveStatuses(
    patient, patientEvents, activeEventTypes, eventRanges, date
  )

  // 查询该患者全部任务，同时取得当天任务以保留完成状态。
  // 一次性任务只在“此前日期已完成”时过滤，完成当天必须继续显示。
  const storageKey = `completedOnce:${patient.id}`
  const allPatientTasks = await db.tasks
    .where('patientId')
    .equals(patient.id!)
    .toArray()

  const existingTasks = allPatientTasks.filter(t => t.date === date)
  const onceTemplateKeys = new Set(
    allEventRangeTasks.filter(t => t.isOnceOnly).map(rangeTaskKey)
  )
  const completedOnceRecords = readCompletedOnceRecords(storageKey, date)

  // 数据库任务带有准确日期，优先用它升级/修正 localStorage 中的旧记录。
  for (const t of allPatientTasks) {
    if (t.isCompleted && t.templateKey && onceTemplateKeys.has(t.templateKey)) {
      const existing = completedOnceRecords.get(t.templateKey)
      if (!existing?.completedDate || t.date < existing.completedDate) {
        completedOnceRecords.set(t.templateKey, {
          key: t.templateKey,
          completedDate: t.date,
          completedAt: t.completedAt,
        })
      }
    }
  }

  // 同日取消勾选时撤销该日完成记录，防止下一次刷新又把任务过滤掉。
  for (const t of existingTasks) {
    if (!t.isCompleted && t.templateKey && onceTemplateKeys.has(t.templateKey)) {
      const record = completedOnceRecords.get(t.templateKey)
      if (record?.completedDate === date) {
        completedOnceRecords.delete(t.templateKey)
      }
    }
  }

  const completedBeforeDateKeys = new Set<string>()
  for (const record of completedOnceRecords.values()) {
    // 只有严格早于目标日完成的一次性任务才过滤，完成当天继续显示并计入进度。
    if (!record.completedDate || record.completedDate < date) {
      completedBeforeDateKeys.add(record.key)
    }
  }

  // 匹配任务：每个活跃 status 贡献其 range 下的所有 tasks
  const matchedTasks = matchRangeTasks(
    date, activeStatuses, allEventRangeTasks, completedBeforeDateKeys
  )

  // 处理临时待办事件：无预定义 range，直接从 PatientEvent 的自定义字段生成 Task
  const temporaryType = activeEventTypes.find(et => et.key === 'temporary')
  const temporaryTasks: Array<{ title: string; description?: string; category: string; statusLabel: string; order: number; _peId?: number }> = []
  if (temporaryType) {
    const tempEvents = patientEvents.filter(pe =>
      pe.eventTypeId === temporaryType.id && pe.eventDate === date && pe.customTitle
    )
    for (const pe of tempEvents) {
      temporaryTasks.push({
        title: pe.customTitle!,
        description: pe.customDescription,
        category: pe.customCategory || 'temporary',
        statusLabel: '临时',
        order: -1,   // 置顶，排在所有模板任务之前
        _peId: pe.id,
      })
    }
  }

  // 优先按稳定 templateKey 保留状态；旧数据没有 key 时按标题兜底。
  const existingByKey = new Map<string, Task>()
  const existingByTitle = new Map<string, Task>()
  for (const t of existingTasks) {
    if (t.templateKey) existingByKey.set(t.templateKey, t)
    existingByTitle.set(t.title, t)
  }

  // 生成模板 Task 记录
  const newTasks: Task[] = matchedTasks.map(({ task, statusLabel }, index) => {
    const templateKey = rangeTaskKey(task)
    const existing = existingByKey.get(templateKey) || existingByTitle.get(task.title)
    const completedRecord = completedOnceRecords.get(templateKey)
    const completedFromTodayRecord = completedRecord?.completedDate === date
    const isCompleted = existing?.isCompleted ?? completedFromTodayRecord

    return {
      patientId: patient.id!,
      patientName: patient.name,
      date,
      title: task.title,
      description: task.description,
      category: task.category,
      statusLabel,
      isCompleted: Boolean(isCompleted),
      completedAt: isCompleted ? (existing?.completedAt || completedRecord?.completedAt || Date.now()) : undefined,
      createdAt: existing?.createdAt || Date.now(),
      order: index,
      // 所有模板任务都保存稳定 key，避免不同 range 的同名任务共享完成状态。
      templateKey,
    }
  })

  // 追加临时待办 Task
  for (let ti = 0; ti < temporaryTasks.length; ti++) {
    const tt = temporaryTasks[ti]
    const templateKey = tt._peId ? `temp:${tt._peId}` : undefined
    const existing = (templateKey ? existingByKey.get(templateKey) : undefined)
      || existingByTitle.get(tt.title)
    newTasks.push({
      patientId: patient.id!,
      patientName: patient.name,
      date,
      title: tt.title,
      description: tt.description,
      category: tt.category as Task['category'],
      statusLabel: tt.statusLabel,
      isCompleted: existing?.isCompleted || false,
      completedAt: existing?.isCompleted ? existing.completedAt : undefined,
      createdAt: existing?.createdAt || Date.now(),
      order: tt.order,
      templateKey,
    })
  }

  // 原子替换：删除旧任务，写入新任务
  if (existingTasks.length > 0) {
    await db.tasks
      .where('[patientId+date]')
      .equals([patient.id!, date])
      .delete()
  }

  if (newTasks.length > 0) {
    await db.tasks.bulkAdd(newTasks)
  }

  localStorage.setItem(storageKey, JSON.stringify([...completedOnceRecords.values()]))

  return newTasks
}

/**
 * 模板匹配：纯按活跃状态 + 日期条件过滤
 */
function matchRangeTasks(
  date: string,
  activeStatuses: import('../types/event').ActiveStatus[],
  allEventRangeTasks: EventRangeTask[],
  completedOnceKeys: Set<string>
): Array<{ task: EventRangeTask; statusLabel: string }> {
  const weekday = getWeekday(date)
  const results: Array<{ task: EventRangeTask; statusLabel: string; order: number }> = []
  const seenKeys = new Set<string>()

  for (const status of activeStatuses) {
    const rangeTasks = allEventRangeTasks.filter(t =>
      t.eventRangeId === status.eventRangeId && t.isActive
    )

    for (const task of rangeTasks) {
      // 1. 过滤一次性已完成任务
      if (task.isOnceOnly) {
        const onceKey = rangeTaskKey(task)
        if (completedOnceKeys.has(onceKey)) continue
      }

      // 2. 星期几过滤（多选，空数组=每天）
      if (task.weekdays.length > 0 && !task.weekdays.includes(weekday)) continue

      // 3. 日期限定过滤
      if (task.isHolidayDependent && task.holidayRule) {
        switch (task.holidayRule) {
          case 'before_holiday':
            if (!isDayBeforeHoliday(date)) continue
            break
          case 'non_workday':
            if (!isNonWorkday(date)) continue
            break
          case 'only_workday':
            if (!isWorkday(date)) continue
            break
        }
      }

      // 5. 按 [rangeId, title] 去重
      const dedupKey = `${task.eventRangeId}:${task.title}`
      if (seenKeys.has(dedupKey)) continue
      seenKeys.add(dedupKey)

      results.push({
        task,
        statusLabel: status.statusLabel,
        order: status.priority * 100 + task.order,
      })
    }
  }

  // 按 order 排序
  results.sort((a, b) => a.order - b.order)

  return results.map(r => ({ task: r.task, statusLabel: r.statusLabel }))
}
