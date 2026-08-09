import type { Patient } from '../types/patient'
import type { EventType, EventRange, PatientEvent, ActiveStatus } from '../types/event'
import { diffDays } from '../utils/date'
import { countWorkdaysBetween, isNonWorkday } from './holiday-utils'

/**
 * 获取患者在当前日期的所有活跃状态（EventRange 级别的叠加）
 *
 * 核心逻辑：
 * 1. 入院状态：根据 patient.admissionDate 匹配 Admission EventType 的所有 ranges
 * 2. 事件状态：遍历每个 PatientEvent，计算 dayOffset（自然日或工作日），
 *    匹配对应 EventType 的 ranges
 * 3. 所有匹配的 range 叠加返回，不做互斥
 */
export function getActiveStatuses(
  patient: Patient,
  patientEvents: PatientEvent[],
  eventTypes: EventType[],
  eventRanges: EventRange[],
  targetDate: string
): ActiveStatus[] {
  const statuses: ActiveStatus[] = []

  // 已归档：唯一真正的终端状态
  if (patient.isArchived) return statuses

  // 找到入院事件类型
  const admissionType = eventTypes.find(et => et.key === 'admission')

  // === 1. 入院状态（基于 patient.admissionDate） ===
  if (admissionType && patient.admissionDate) {
    const admissionRanges = eventRanges.filter(r => r.eventTypeId === admissionType.id)
    const dayFromAdmission = diffDays(targetDate, patient.admissionDate)

    for (const range of admissionRanges) {
      if (dayFromAdmission >= range.dayOffsetStart && dayFromAdmission <= range.dayOffsetEnd) {
        statuses.push({
          eventRangeId: range.id!,
          eventTypeId: admissionType.id!,
          eventTypeName: admissionType.name,
          eventTypeIcon: admissionType.icon,
          eventTypeKey: admissionType.key,
          eventDate: patient.admissionDate,
          statusLabel: range.statusLabel,
          color: range.color,
          priority: admissionType.order * 1000 + range.order,
        })
      }
    }
  }

  // === 2. 事件状态（基于 PatientEvent） ===
  for (const pe of patientEvents) {
    const et = eventTypes.find(t => t.id === pe.eventTypeId)
    if (!et || !et.isActive) continue

    const ranges = eventRanges.filter(r => r.eventTypeId === et.id)

    for (const range of ranges) {
      let dayOffset: number

      if (range.useWorkdayOffset) {
        // 按工作日计数：目标日期必须是工作日，否则不应匹配
        if (isNonWorkday(targetDate)) continue
        dayOffset = countWorkdaysBetween(pe.eventDate, targetDate)
      } else {
        // 按自然日计数
        dayOffset = diffDays(targetDate, pe.eventDate)
      }

      if (dayOffset >= range.dayOffsetStart && dayOffset <= range.dayOffsetEnd) {
        statuses.push({
          eventRangeId: range.id!,
          eventTypeId: et.id!,
          eventTypeName: et.name,
          eventTypeIcon: et.icon,
          eventTypeKey: et.key,
          eventDate: pe.eventDate,
          statusLabel: range.statusLabel,
          color: range.color,
          priority: et.order * 1000 + range.order,
        })
      }
    }
  }

  // 按 priority 降序排序（高优先级的在前）
  statuses.sort((a, b) => b.priority - a.priority)

  return statuses
}

/**
 * 获取用于卡片展示的"主状态"（取 priority 最高的）
 */
export function getPrimaryStatus(
  patient: Patient,
  patientEvents: PatientEvent[],
  eventTypes: EventType[],
  eventRanges: EventRange[],
  targetDate: string
): ActiveStatus | null {
  // 已归档特殊处理
  if (patient.isArchived) return null

  const statuses = getActiveStatuses(patient, patientEvents, eventTypes, eventRanges, targetDate)
  return statuses.length > 0 ? statuses[0] : null
}

// ====== 保留旧接口兼容（逐步迁移） ======

/**
 * @deprecated 使用 getActiveStatuses 代替
 */
export function getAllActiveStatuses(patient: Patient, targetDate?: string): string[] {
  // 已归档
  if (patient.isArchived) return ['archived']
  // 不包含事件数据时返回空
  return []
}

/**
 * @deprecated 使用 getPrimaryStatus 代替
 */
export function determinePatientStatus(patient: Patient, targetDate?: string): string {
  if (patient.isArchived) return 'archived'
  return 'normal_inpatient'
}
