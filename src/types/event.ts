import type { TaskCategory, HolidayRule } from './enums'

export interface EventType {
  id?: number
  name: string                    // "手术"
  key: string                     // "surgery" — 唯一标识
  icon: string                    // "🔪"
  color: string                   // "border-l-purple-500 bg-purple-50"
  isBuiltIn: boolean              // 内置事件(入院/手术/出院)不可删除
  isActive: boolean
  order: number
  createdAt: number
  updatedAt: number
}

export interface EventRange {
  id?: number
  eventTypeId: number
  name: string                    // "术前准备期"
  statusLabel: string             // 用作 Task 的分组标签
  color: string                   // "border-l-blue-500 bg-blue-50"
  dayOffsetStart: number          // 负数=事件前，0=当日，正数=事件后
  dayOffsetEnd: number            // 闭区间
  useWorkdayOffset: boolean       // 是否按工作日计算 dayOffset
  order: number
}

export interface EventRangeTask {
  id?: number
  eventRangeId: number
  key?: string                    // 可选的语义标识符，供代码引用（不依赖可变标题）
  title: string
  description?: string
  category: TaskCategory
  weekdays: number[]              // 空数组=每天，[1,3,5]=周一三五，0=周日
  isHolidayDependent: boolean
  holidayRule: HolidayRule | null
  isOnceOnly: boolean             // 一次性任务，完成不再出现
  isActive: boolean
  order: number
}

export interface PatientEvent {
  id?: number
  patientId: number
  eventTypeId: number
  eventDate: string               // "2026-08-10"
  createdAt: number
  updatedAt: number
}

/** getActiveStatuses 的返回值：一个匹配的 EventRange 信息 */
export interface ActiveStatus {
  eventRangeId: number
  eventTypeId: number
  eventTypeName: string
  eventTypeIcon: string
  eventTypeKey: string
  eventDate: string               // 触发该状态的 PatientEvent 日期（入院则为 admissionDate）
  statusLabel: string
  color: string
  priority: number                // eventType.order * 1000 + range.order，用于排序
}
