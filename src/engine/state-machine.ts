import type { Patient } from '../types/patient'
import { PatientStatus } from '../types/enums'
import { diffDays, addDays, getWeekday, today, isWeekend } from '../utils/date'
import { isWorkday } from './holiday-utils'

/**
 * 判断手术阶段：患者在手术流程的哪个位置
 */
function determineSurgeryPhase(patient: Patient, targetDate: string): 'pre' | 'pre_day' | 'surgery_day' | 'post' | null {
  if (!patient.hasSurgery || !patient.surgeryDate) return null

  const daysFromSurgery = diffDays(targetDate, patient.surgeryDate)

  if (daysFromSurgery === 0) return 'surgery_day'
  if (daysFromSurgery === -1) return 'pre_day'
  if (daysFromSurgery < 0) return 'pre'
  return 'post'
}

/**
 * 核心：根据患者数据和目标日期，判定患者当前状态
 * 按优先级从高到低匹配，命中即返回
 */
export function determinePatientStatus(patient: Patient, targetDate?: string): PatientStatus {
  const date = targetDate || today()

  // 1. 已归档
  if (patient.isArchived) return PatientStatus.ARCHIVED

  // 2. 出院当日
  if (patient.dischargeDate && patient.dischargeDate === date) {
    return PatientStatus.DISCHARGE_DAY
  }

  // 3. 预出院（出院前一天）
  // 注意：按需求，预出院是"出院前一工作日"
  if (patient.dischargeDate) {
    const prevWorkday = getPrevWorkday(patient.dischargeDate)
    if (date === prevWorkday) {
      return PatientStatus.PRE_DISCHARGE
    }
    // 如果已经过了预出院日但还没到出院日，也显示为预出院
    const daysToDischarge = diffDays(patient.dischargeDate, date)
    if (daysToDischarge < 0 && date < patient.dischargeDate) {
      return PatientStatus.PRE_DISCHARGE
    }
  }

  // 4. 手术当日
  if (patient.surgeryDate && patient.surgeryDate === date) {
    return PatientStatus.SURGERY_DAY
  }

  // 5. 术前一天
  if (patient.surgeryDate) {
    const preSurgeryDay = addDays(patient.surgeryDate, -1)
    if (date === preSurgeryDay) {
      return PatientStatus.PRE_SURGERY
    }
  }

  // 6. 术前准备期（确定了手术但还没到术前一天）
  if (patient.hasSurgery && patient.surgeryDate) {
    const daysToSurgery = diffDays(patient.surgeryDate, date)
    if (daysToSurgery < -1) {
      return PatientStatus.SURGERY_PRE
    }
  }

  // 7-9. 按入院天数判定
  const daysFromAdmission = diffDays(date, patient.admissionDate)

  if (daysFromAdmission === 0) return PatientStatus.DAY0_ADMISSION
  if (daysFromAdmission === 1) return PatientStatus.DAY1_ADMISSION
  if (daysFromAdmission >= 2) return PatientStatus.NORMAL_INPATIENT

  // 默认：在院正常
  return PatientStatus.NORMAL_INPATIENT
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

/**
 * 判断入院第三天是否为非工作日
 */
export function isDay3NonWorkday(admissionDate: string, targetDate?: string): boolean {
  const date = targetDate || today()
  const daysFromAdmission = diffDays(date, admissionDate)
  if (daysFromAdmission !== 3) return false
  return isWeekend(date) || !isWorkday(date)
}

export { determineSurgeryPhase }
