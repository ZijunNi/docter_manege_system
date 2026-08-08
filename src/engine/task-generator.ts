import { db } from '../db'
import type { Patient } from '../types/patient'
import type { Task } from '../types/task'
import type { EventType, EventRange, EventRangeTask, PatientEvent } from '../types/event'
import { getActiveStatuses } from './state-machine'
import { today, getWeekday, isWeekend } from '../utils/date'
import { isDayBeforeHoliday, isNonWorkday } from './holiday-utils'

// 模块级互斥锁，防止 generateDailyTasks 被并发调用
let refreshLock: Promise<void> | null = null

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

  // 查询该患者历史上已完成的一次性任务（跨日期）
  const allPatientTasks = await db.tasks
    .where('patientId')
    .equals(patient.id!)
    .toArray()
  const completedOnceKeys = new Set(
    allPatientTasks
      .filter(t => t.isCompleted && t.templateKey)
      .map(t => t.templateKey!)
  )

  // 匹配任务：每个活跃 status 贡献其 range 下的所有 tasks
  const matchedTasks = matchRangeTasks(
    patient, date, activeStatuses, allEventRangeTasks, completedOnceKeys
  )

  // 查询今日已有任务（用于保留完成状态）
  const existingTasks = await db.tasks
    .where('[patientId+date]')
    .equals([patient.id!, date])
    .toArray()

  const completedMap = new Map<string, boolean>()
  for (const t of existingTasks) {
    completedMap.set(t.title, t.isCompleted)
  }

  // 生成 Task 记录
  const newTasks: Task[] = matchedTasks.map(({ task, statusLabel }, index) => ({
    patientId: patient.id!,
    patientName: patient.name,
    date,
    title: task.title,
    description: task.description,
    category: task.category,
    statusLabel,
    isCompleted: completedMap.get(task.title) || false,
    completedAt: completedMap.get(task.title) ? Date.now() : undefined,
    createdAt: Date.now(),
    order: index,
    templateKey: task.isOnceOnly ? `range:${task.eventRangeId}:${task.title}` : undefined,
  }))

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

  return newTasks
}

/**
 * 模板匹配：纯按活跃状态 + 日期条件过滤
 */
function matchRangeTasks(
  patient: Patient,
  date: string,
  activeStatuses: import('../types/event').ActiveStatus[],
  allEventRangeTasks: EventRangeTask[],
  completedOnceKeys: Set<string>
): Array<{ task: EventRangeTask; statusLabel: string }> {
  const weekday = getWeekday(date)
  const results: Array<{ task: EventRangeTask; statusLabel: string; order: number }> = []
  const seenKeys = new Set<string>()

  // 收集活跃 range 的 ID 集合
  const activeRangeIds = new Set(activeStatuses.map(s => s.eventRangeId))

  for (const status of activeStatuses) {
    const rangeTasks = allEventRangeTasks.filter(t =>
      t.eventRangeId === status.eventRangeId && t.isActive
    )

    for (const task of rangeTasks) {
      // 1. 过滤一次性已完成任务
      if (task.isOnceOnly) {
        const onceKey = `range:${task.eventRangeId}:${task.title}`
        if (completedOnceKeys.has(onceKey)) continue
      }

      // 2. 星期几过滤
      if (task.weekday !== null && task.weekday !== weekday) continue

      // 3. 假期条件过滤
      if (task.isHolidayDependent && task.holidayRule) {
        switch (task.holidayRule) {
          case 'before_holiday':
            if (!isDayBeforeHoliday(date)) continue
            break
          case 'non_workday':
            if (!isNonWorkday(date)) continue
            break
        }
      }

      // 4. DAY1 特殊规则：工作日 vs 周末二选一
      // 入院第二日：工作日写副主任查房，周末写日常病程
      if (status.eventTypeKey === 'admission') {
        const dayFromAdmission = diffDaysInternal(date, patient.admissionDate)
        if (dayFromAdmission === 1) {
          if (isWeekend(date)) {
            // 周末：只保留「写日常病程」任务
            if (task.title === '写副主任查房') continue
          } else {
            // 工作日：只保留「写副主任查房」任务
            if (task.title === '写日常病程') continue
          }
        }

        // 入院第三天且非工作日：追加日常病程
        if (dayFromAdmission === 3 && isNonWorkday(date)) {
          if (task.title === '写日常病程' && task.isHolidayDependent) {
            // 允许通过（已在上面通过 holidayRule 过滤）
          }
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

/** 内部日期差值计算 */
function diffDaysInternal(date1: string, date2: string): number {
  const d1 = new Date(date1 + 'T00:00:00')
  const d2 = new Date(date2 + 'T00:00:00')
  return Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24))
}
