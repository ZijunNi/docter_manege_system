import type { Patient } from '../types/patient'
import { PatientStatus } from '../types/enums'
import { diffDays, addDays, getWeekday, today, isWeekend } from '../utils/date'
import { isWorkday } from './holiday-utils'

/**
 * 获取患者所有当前活跃的状态（纯叠加，无覆盖）
 *
 * 每个状态独立贡献其对应的模板。状态之间不互相覆盖——
 * 一个患者可以同时处于 DAY0_ADMISSION + SURGERY_PRE + PRE_SURGERY + PRE_DISCHARGE。
 */
export function getAllActiveStatuses(patient: Patient, targetDate?: string): PatientStatus[] {
  const date = targetDate || today()

  // 已归档：唯一真正的终端状态
  if (patient.isArchived) return [PatientStatus.ARCHIVED]

  const statuses: PatientStatus[] = []

  // === 基础状态（入院天数） ===
  const daysFromAdmission = diffDays(date, patient.admissionDate)
  if (daysFromAdmission === 0) {
    statuses.push(PatientStatus.DAY0_ADMISSION)
  } else if (daysFromAdmission === 1) {
    statuses.push(PatientStatus.DAY1_ADMISSION)
  } else {
    statuses.push(PatientStatus.NORMAL_INPATIENT)
  }

  // === 手术叠加状态 ===
  // diffDays(surgeryDate, today): 正数=手术在未来, 0=今天, 负数=已过去
  if (patient.hasSurgery && patient.surgeryDate) {
    const daysToSurgery = diffDays(patient.surgeryDate, date)
    if (daysToSurgery === 0) {
      statuses.push(PatientStatus.SURGERY_DAY)
    } else if (daysToSurgery > 0) {
      statuses.push(PatientStatus.SURGERY_PRE)
      if (daysToSurgery === 1) {
        statuses.push(PatientStatus.PRE_SURGERY)
      }
    } else if (daysToSurgery < 0 && daysToSurgery >= -2) {
      // 术后第1-2天（手术当天是 day 0，术后第1天是 -1，第2天是 -2）
      statuses.push(PatientStatus.POST_SURGERY)
    }
  }

  // === 出院叠加状态 ===
  if (patient.dischargeDate) {
    if (date === patient.dischargeDate) {
      statuses.push(PatientStatus.DISCHARGE_DAY)
    } else if (date < patient.dischargeDate) {
      const prevWorkday = getPrevWorkday(patient.dischargeDate)
      if (date === prevWorkday) {
        statuses.push(PatientStatus.PRE_DISCHARGE)
      }
    }
  }

  return statuses
}

/**
 * 获取用于卡片展示的"主状态"（取最紧急的）
 */
export function determinePatientStatus(patient: Patient, targetDate?: string): PatientStatus {
  const statuses = getAllActiveStatuses(patient, targetDate)
  return statuses[statuses.length - 1]
}

/**
 * 判断入院第三天是否为非工作日
 */
export function isDay3NonWorkday(admissionDate: string, targetDate?: string): boolean {
  const date = targetDate || today()
  const daysFromAdmission = diffDays(date, admissionDate)
  if (daysFromAdmission !== 3) return false
  return isWeekend(date) || !isWorkday(date)
}

/**
 * 获取某个日期之前最近的一个工作日
 */
function getPrevWorkday(date: string): string {
  let prev = addDays(date, -1)
  while (true) {
    const w = getWeekday(prev)
    if (w !== 0 && w !== 6 && isWorkday(prev)) return prev
    prev = addDays(prev, -1)
  }
}
