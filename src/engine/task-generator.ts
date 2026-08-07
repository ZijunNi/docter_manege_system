import { db } from '../db'
import type { Patient } from '../types/patient'
import type { Task } from '../types/task'
import type { TaskTemplate } from '../types/task-template'
import { PatientStatus, TaskCategory, SurgeryPhase } from '../types/enums'
import { determinePatientStatus, determineSurgeryPhase, isDay3NonWorkday } from './state-machine'
import { today, getWeekday, isWeekend } from '../utils/date'
import { isWorkday, isDayBeforeHoliday, isNonWorkday } from './holiday-utils'

/**
 * 每日任务生成：为所有未归档患者生成今日任务
 * 已有任务（按 patientId+date 匹配）会保留完成状态
 */
export async function generateDailyTasks(targetDate?: string): Promise<void> {
  const date = targetDate || today()

  // 1. 获取所有未归档患者
  const patients = await db.patients
    .where('isArchived')
    .equals(0)
    .toArray()

  // 2. 获取所有激活的模板（filter 而非 where，因为 isActive 不在索引中）
  const templates = await db.taskTemplates.toArray()
  const allTemplates = templates.filter(t => t.isActive)

  for (const patient of patients) {
    // 3. 判定患者状态
    const status = determinePatientStatus(patient, date)

    // 4. 更新患者状态
    await db.patients.update(patient.id!, { status, updatedAt: Date.now() })

    // 5. 匹配模板
    const matchedTemplates = matchTemplates(patient, date, status, allTemplates)

    // 6. 获取该患者当天的已有任务（保留完成状态）
    const existingTasks = await db.tasks
      .where('[patientId+date]')
      .equals([patient.id!, date])
      .toArray()

    const completedMap = new Map<string, boolean>()
    for (const t of existingTasks) {
      completedMap.set(t.title, t.isCompleted)
    }

    // 7. 生成新任务列表
    const newTasks: Task[] = matchedTemplates.map((tmpl, index) => ({
      patientId: patient.id!,
      patientName: patient.name,
      date,
      title: tmpl.title,
      description: tmpl.description,
      category: tmpl.category,
      patientStatus: status,
      isCompleted: completedMap.get(tmpl.title) || false,
      completedAt: completedMap.get(tmpl.title) ? Date.now() : undefined,
      createdAt: Date.now(),
      order: index,
    }))

    // 8. 删除旧任务、写入新任务
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
}

/**
 * 为单个患者生成当天的任务（用于新增患者后立即生成）
 */
export async function generateTasksForPatient(patient: Patient, targetDate?: string): Promise<Task[]> {
  const date = targetDate || today()
  const status = determinePatientStatus(patient, date)

  await db.patients.update(patient.id!, { status, updatedAt: Date.now() })

  const templates = await db.taskTemplates.toArray()
  const allTemplates = templates.filter(t => t.isActive)

  const matchedTemplates = matchTemplates(patient, date, status, allTemplates)

  const tasks: Task[] = matchedTemplates.map((tmpl, index) => ({
    patientId: patient.id!,
    patientName: patient.name,
    date,
    title: tmpl.title,
    description: tmpl.description,
    category: tmpl.category,
    patientStatus: status,
    isCompleted: false,
    createdAt: Date.now(),
    order: index,
  }))

  if (tasks.length > 0) {
    await db.tasks.bulkAdd(tasks)
  }

  return tasks
}

/**
 * 根据患者状态和日期，匹配适用的任务模板
 */
function matchTemplates(
  patient: Patient,
  date: string,
  status: PatientStatus,
  allTemplates: TaskTemplate[]
): TaskTemplate[] {
  const weekday = getWeekday(date)
  const surgeryPhase = determineSurgeryPhase(patient, date)

  let candidates = allTemplates.filter(t => t.patientStatus === status)

  // 过滤：星期几
  candidates = candidates.filter(t => t.weekday === null || t.weekday === weekday)

  // 过滤：手术阶段
  candidates = candidates.filter(t => {
    if (t.surgeryPhase === null) return true
    if (!patient.hasSurgery) return false
    return t.surgeryPhase === surgeryPhase
  })

  // 过滤：假期条件
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

  // 特殊规则处理：day1 入院第二日
  if (status === PatientStatus.DAY1_ADMISSION) {
    if (isWeekend(date)) {
      // 周末写日常病程，排除副主任查房
      candidates = candidates.filter(t => t.key !== 'day1_deputy_director')
    } else {
      // 工作日写副主任查房，排除日常病程
      candidates = candidates.filter(t => t.key !== 'day1_daily_record')
    }
  }

  // 特殊规则：入院第三天且非工作日
  if (isDay3NonWorkday(patient.admissionDate, date)) {
    const day3Template = allTemplates.find(t => t.key === 'day3_weekend_record')
    if (day3Template) {
      candidates.push(day3Template)
    }
  }

  // 按 order 排序
  candidates.sort((a, b) => a.order - b.order)

  return candidates
}
