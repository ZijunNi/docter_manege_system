import { db } from '../db'
import type { Patient } from '../types/patient'
import type { Task } from '../types/task'
import type { TaskTemplate } from '../types/task-template'
import { PatientStatus } from '../types/enums'
import { determinePatientStatus, isDay3NonWorkday, getAllActiveStatuses } from './state-machine'
import { today, getWeekday, isWeekend } from '../utils/date'
import { isDayBeforeHoliday, isNonWorkday } from './holiday-utils'

// 模块级互斥锁，防止 generateDailyTasks 被并发调用
let refreshLock: Promise<void> | null = null

/**
 * 每日任务生成：为所有未归档患者生成今日任务
 * 内置互斥锁，并发调用时只会执行一次
 */
export async function generateDailyTasks(targetDate?: string): Promise<void> {
  // 如果已有刷新在进行中，等待它完成而不是重复执行
  if (refreshLock) {
    await refreshLock
    return
  }

  refreshLock = (async () => {
    const date = targetDate || today()

  const patients = await db.patients
    .where('isArchived')
    .equals(0)
    .toArray()

  const templates = await db.taskTemplates.toArray()
  const allTemplates = templates.filter(t => t.isActive)

  for (const patient of patients) {
    const statuses = getAllActiveStatuses(patient, date)
    const displayStatus = determinePatientStatus(patient, date)

    await db.patients.update(patient.id!, { status: displayStatus, updatedAt: Date.now() })

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

    // 匹配所有活跃状态的模板
    const matchedTemplates = matchTemplates(patient, date, statuses, allTemplates, completedOnceKeys)

    const existingTasks = await db.tasks
      .where('[patientId+date]')
      .equals([patient.id!, date])
      .toArray()

    const completedMap = new Map<string, boolean>()
    for (const t of existingTasks) {
      completedMap.set(t.title, t.isCompleted)
    }

    const newTasks: Task[] = matchedTemplates.map((tmpl, index) => ({
      patientId: patient.id!,
      patientName: patient.name,
      date,
      title: tmpl.title,
      description: tmpl.description,
      category: tmpl.category,
      patientStatus: tmpl.patientStatus,
      isCompleted: completedMap.get(tmpl.title) || false,
      completedAt: completedMap.get(tmpl.title) ? Date.now() : undefined,
      createdAt: Date.now(),
      order: index,
      templateKey: tmpl.key,
    }))

    if (existingTasks.length > 0) {
      await db.tasks
        .where('[patientId+date]')
        .equals([patient.id!, date])
        .delete()
    }

    if (newTasks.length > 0) {
      await db.tasks.bulkAdd(newTasks)
    }
  }
  })()

  try {
    await refreshLock
  } finally {
    refreshLock = null
  }
}

/**
 * 为单个患者生成当天的任务
 */
export async function generateTasksForPatient(patient: Patient, targetDate?: string): Promise<Task[]> {
  const date = targetDate || today()
  const statuses = getAllActiveStatuses(patient, date)
  const displayStatus = determinePatientStatus(patient, date)

  await db.patients.update(patient.id!, { status: displayStatus, updatedAt: Date.now() })

  const templates = await db.taskTemplates.toArray()
  const allTemplates = templates.filter(t => t.isActive)

  // 查询该患者历史上已完成的一次性任务
  const allPatientTasks = await db.tasks
    .where('patientId')
    .equals(patient.id!)
    .toArray()
  const completedOnceKeys = new Set(
    allPatientTasks
      .filter(t => t.isCompleted && t.templateKey)
      .map(t => t.templateKey!)
  )

  const matchedTemplates = matchTemplates(patient, date, statuses, allTemplates, completedOnceKeys)

  const tasks: Task[] = matchedTemplates.map((tmpl, index) => ({
    patientId: patient.id!,
    patientName: patient.name,
    date,
    title: tmpl.title,
    description: tmpl.description,
    category: tmpl.category,
    patientStatus: tmpl.patientStatus,
    isCompleted: false,
    createdAt: Date.now(),
    order: index,
    templateKey: tmpl.key,
  }))

  if (tasks.length > 0) {
    await db.tasks.bulkAdd(tasks)
  }

  return tasks
}

/**
 * 模板匹配：纯按 patientStatus + 必要的日期条件过滤
 *
 * 核心原则：患者每具有一个状态，就贡献该状态下的所有模板。
 * 模板自身的 weekday / holidayRule 字段仅用于判断"今天是否适用"。
 */
function matchTemplates(
  patient: Patient,
  date: string,
  statuses: PatientStatus[],
  allTemplates: TaskTemplate[],
  completedOnceKeys: Set<string> = new Set()
): TaskTemplate[] {
  const weekday = getWeekday(date)

  // 1. 按活跃状态筛选：每个状态贡献其全部模板
  let candidates = allTemplates.filter(t => statuses.includes(t.patientStatus))

  // 1.5 过滤已完成的一次性任务（如签知情同意书，一旦完成就不再出现）
  candidates = candidates.filter(t => {
    if (!t.isOnceOnly) return true
    return !completedOnceKeys.has(t.key)
  })

  // 2. 星期几过滤（模板自身声明了适用的 weekday）
  candidates = candidates.filter(t => t.weekday === null || t.weekday === weekday)

  // 3. 假期条件过滤（模板自身声明了假期依赖）
  candidates = candidates.filter(t => {
    if (!t.isHolidayDependent || t.holidayRule === null) return true
    switch (t.holidayRule) {
      case 'before_holiday':
        return isDayBeforeHoliday(date)
      case 'non_workday':
        return isNonWorkday(date)
      default:
        return true
    }
  })

  // 4. DAY1 特殊规则：工作日 vs 周末二选一
  if (statuses.includes(PatientStatus.DAY1_ADMISSION)) {
    if (isWeekend(date)) {
      candidates = candidates.filter(t => t.key !== 'day1_deputy_director')
    } else {
      candidates = candidates.filter(t => t.key !== 'day1_daily_record')
    }
  }

  // 5. 入院第三天且非工作日：追加日常病程
  if (isDay3NonWorkday(patient.admissionDate, date)) {
    const day3Template = allTemplates.find(t => t.key === 'day3_weekend_record')
    if (day3Template && !candidates.some(t => t.key === 'day3_weekend_record')) {
      candidates.push(day3Template)
    }
  }

  // 6. 按 key 去重
  const seen = new Set<string>()
  candidates = candidates.filter(t => {
    if (seen.has(t.key)) return false
    seen.add(t.key)
    return true
  })

  // 7. 按 order 排序
  candidates.sort((a, b) => a.order - b.order)

  return candidates
}
