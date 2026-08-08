import type { EventType, EventRange, EventRangeTask } from '../types/event'
import { TaskCategory, HolidayRule } from '../types/enums'

// ====== 辅助函数：构建完整的事件类型（含 ranges + tasks） ======

interface SeedEventType {
  eventType: Omit<EventType, 'id' | 'createdAt' | 'updatedAt'>
  ranges: Array<{
    range: Omit<EventRange, 'id' | 'eventTypeId'>
    tasks: Omit<EventRangeTask, 'id' | 'eventRangeId'>[]
  }>
}

/**
 * 所有内置事件模板的种子数据
 */
export const seedEventTypes: SeedEventType[] = [
  // ========================================
  // 入院事件
  // ========================================
  {
    eventType: {
      name: '入院',
      key: 'admission',
      icon: '🏥',
      color: 'border-l-red-500 bg-red-50',
      isBuiltIn: true,
      isActive: true,
      order: 1,
    },
    ranges: [
      // --- 入院当日 (day 0~0) ---
      {
        range: {
          name: '入院当日',
          statusLabel: '入院当日',
          color: 'border-l-red-500 bg-red-50',
          dayOffsetStart: 0,
          dayOffsetEnd: 0,
          useWorkdayOffset: false,
          order: 1,
        },
        tasks: [
          { title: '写入院记录', category: TaskCategory.MEDICAL_RECORD, weekday: null, isHolidayDependent: false, holidayRule: null, isOnceOnly: false, isActive: true, order: 1 },
          { title: '写首程', category: TaskCategory.MEDICAL_RECORD, weekday: null, isHolidayDependent: false, holidayRule: null, isOnceOnly: false, isActive: true, order: 2 },
          { title: '写主治查房', category: TaskCategory.MEDICAL_RECORD, weekday: null, isHolidayDependent: false, holidayRule: null, isOnceOnly: false, isActive: true, order: 3 },
          { title: '写副主任查房', description: '假期前一天入院加写', category: TaskCategory.MEDICAL_RECORD, weekday: null, isHolidayDependent: true, holidayRule: HolidayRule.BEFORE_HOLIDAY, isOnceOnly: false, isActive: true, order: 4 },
          { title: '开医嘱', category: TaskCategory.ORDER, weekday: null, isHolidayDependent: false, holidayRule: null, isOnceOnly: false, isActive: true, order: 5 },
          { title: '打印检查单、调药单', category: TaskCategory.PRINT, weekday: null, isHolidayDependent: false, holidayRule: null, isOnceOnly: false, isActive: true, order: 6 },
          { title: '签字', category: TaskCategory.SIGN, weekday: null, isHolidayDependent: false, holidayRule: null, isOnceOnly: false, isActive: true, order: 7 },
          { title: '做心电图', category: TaskCategory.ECG, weekday: null, isHolidayDependent: false, holidayRule: null, isOnceOnly: false, isActive: true, order: 8 },
          { title: '出心电图报告', category: TaskCategory.ECG, weekday: null, isHolidayDependent: false, holidayRule: null, isOnceOnly: false, isActive: true, order: 9 },
        ],
      },
      // --- 入院第二日 (day 1~1) ---
      {
        range: {
          name: '入院第二日',
          statusLabel: '入院第二日',
          color: 'border-l-orange-500 bg-orange-50',
          dayOffsetStart: 1,
          dayOffsetEnd: 1,
          useWorkdayOffset: false,
          order: 2,
        },
        tasks: [
          { title: '写副主任查房', category: TaskCategory.MEDICAL_RECORD, weekday: null, isHolidayDependent: false, holidayRule: null, isOnceOnly: false, isActive: true, order: 1 },
          { title: '写日常病程', description: '周六日写', category: TaskCategory.MEDICAL_RECORD, weekday: null, isHolidayDependent: true, holidayRule: HolidayRule.NON_WORKDAY, isOnceOnly: false, isActive: true, order: 2 },
        ],
      },
      // --- 常规在院 (day 2~365) ---
      {
        range: {
          name: '常规在院',
          statusLabel: '在院',
          color: 'border-l-green-500 bg-green-50',
          dayOffsetStart: 2,
          dayOffsetEnd: 365,
          useWorkdayOffset: false,
          order: 3,
        },
        tasks: [
          { title: '写主治查房病程', category: TaskCategory.MEDICAL_RECORD, weekday: 1, isHolidayDependent: false, holidayRule: null, isOnceOnly: false, isActive: true, order: 1 },
          { title: '写主治查房病程', category: TaskCategory.MEDICAL_RECORD, weekday: 2, isHolidayDependent: false, holidayRule: null, isOnceOnly: false, isActive: true, order: 2 },
          { title: '写主任查房病程', category: TaskCategory.MEDICAL_RECORD, weekday: 3, isHolidayDependent: false, holidayRule: null, isOnceOnly: false, isActive: true, order: 3 },
          { title: '写主治查房病程', category: TaskCategory.MEDICAL_RECORD, weekday: 4, isHolidayDependent: false, holidayRule: null, isOnceOnly: false, isActive: true, order: 4 },
          { title: '写副主任查房病程', category: TaskCategory.MEDICAL_RECORD, weekday: 5, isHolidayDependent: false, holidayRule: null, isOnceOnly: false, isActive: true, order: 5 },
          { title: '写日常病程', description: '入院第三天，非工作日', category: TaskCategory.MEDICAL_RECORD, weekday: null, isHolidayDependent: true, holidayRule: HolidayRule.NON_WORKDAY, isOnceOnly: false, isActive: true, order: 6 },
        ],
      },
    ],
  },

  // ========================================
  // 手术事件
  // ========================================
  {
    eventType: {
      name: '手术',
      key: 'surgery',
      icon: '🔪',
      color: 'border-l-purple-500 bg-purple-50',
      isBuiltIn: true,
      isActive: true,
      order: 2,
    },
    ranges: [
      // --- 术前准备期 (day -∞ ~ -2) ---
      {
        range: {
          name: '术前准备期',
          statusLabel: '术前准备',
          color: 'border-l-blue-500 bg-blue-50',
          dayOffsetStart: -365,
          dayOffsetEnd: -2,
          useWorkdayOffset: false,
          order: 1,
        },
        tasks: [
          { title: '签手术相关知情同意书', category: TaskCategory.SIGN, weekday: null, isHolidayDependent: false, holidayRule: null, isOnceOnly: true, isActive: true, order: 1 },
          { title: '签自费知情', category: TaskCategory.SIGN, weekday: null, isHolidayDependent: false, holidayRule: null, isOnceOnly: true, isActive: true, order: 2 },
          { title: '开双联抗血小板医嘱', description: '必要时加用护胃药物', category: TaskCategory.ORDER, weekday: null, isHolidayDependent: false, holidayRule: null, isOnceOnly: true, isActive: true, order: 3 },
        ],
      },
      // --- 术前一天 (day -1~-1) ---
      {
        range: {
          name: '术前一天',
          statusLabel: '术前一天',
          color: 'border-l-blue-600 bg-blue-100',
          dayOffsetStart: -1,
          dayOffsetEnd: -1,
          useWorkdayOffset: false,
          order: 2,
        },
        tasks: [
          { title: '开术前医嘱', category: TaskCategory.ORDER, weekday: null, isHolidayDependent: false, holidayRule: null, isOnceOnly: false, isActive: true, order: 1 },
          { title: '完成术前讨论文书', category: TaskCategory.MEDICAL_RECORD, weekday: null, isHolidayDependent: false, holidayRule: null, isOnceOnly: false, isActive: true, order: 2 },
        ],
      },
      // --- 手术当日 (day 0~0) ---
      {
        range: {
          name: '手术当日',
          statusLabel: '手术当日',
          color: 'border-l-purple-500 bg-purple-50',
          dayOffsetStart: 0,
          dayOffsetEnd: 0,
          useWorkdayOffset: false,
          order: 3,
        },
        tasks: [
          { title: '松夹子、测血压、做心电图', category: TaskCategory.ECG, weekday: null, isHolidayDependent: false, holidayRule: null, isOnceOnly: false, isActive: true, order: 1 },
          { title: '看术后回单，开相关检查', category: TaskCategory.ORDER, weekday: null, isHolidayDependent: false, holidayRule: null, isOnceOnly: false, isActive: true, order: 2 },
          { title: '写术后首程', category: TaskCategory.MEDICAL_RECORD, weekday: null, isHolidayDependent: false, holidayRule: null, isOnceOnly: false, isActive: true, order: 3 },
        ],
      },
      // --- 术后恢复 (day +1~+2) ---
      {
        range: {
          name: '术后恢复',
          statusLabel: '术后恢复',
          color: 'border-l-indigo-500 bg-indigo-50',
          dayOffsetStart: 1,
          dayOffsetEnd: 2,
          useWorkdayOffset: false,
          order: 4,
        },
        tasks: [
          { title: '写术后病程', description: '手术后3日内每日需有病程', category: TaskCategory.MEDICAL_RECORD, weekday: null, isHolidayDependent: false, holidayRule: null, isOnceOnly: false, isActive: true, order: 1 },
        ],
      },
    ],
  },

  // ========================================
  // 出院事件
  // ========================================
  {
    eventType: {
      name: '出院',
      key: 'discharge',
      icon: '🏠',
      color: 'border-l-amber-500 bg-amber-50',
      isBuiltIn: true,
      isActive: true,
      order: 3,
    },
    ranges: [
      // --- 预出院 (前一工作日) ---
      {
        range: {
          name: '预出院',
          statusLabel: '预出院',
          color: 'border-l-yellow-500 bg-yellow-50',
          dayOffsetStart: -1,
          dayOffsetEnd: -1,
          useWorkdayOffset: true,   // 按工作日计算
          order: 1,
        },
        tasks: [
          { title: '开预出院医嘱', description: '明日出院/隔一日出院/隔两日出院', category: TaskCategory.ORDER, weekday: null, isHolidayDependent: false, holidayRule: null, isOnceOnly: false, isActive: true, order: 1 },
          { title: '开出院带药医嘱', category: TaskCategory.ORDER, weekday: null, isHolidayDependent: false, holidayRule: null, isOnceOnly: false, isActive: true, order: 2 },
          { title: '写出院诊断证明书', category: TaskCategory.MEDICAL_RECORD, weekday: null, isHolidayDependent: false, holidayRule: null, isOnceOnly: false, isActive: true, order: 3 },
          { title: '审核医保', category: TaskCategory.DISCHARGE, weekday: null, isHolidayDependent: false, holidayRule: null, isOnceOnly: false, isActive: true, order: 4 },
        ],
      },
      // --- 出院当日 (day 0~0) ---
      {
        range: {
          name: '出院当日',
          statusLabel: '出院当日',
          color: 'border-l-amber-500 bg-amber-50',
          dayOffsetStart: 0,
          dayOffsetEnd: 0,
          useWorkdayOffset: false,
          order: 2,
        },
        tasks: [
          { title: '开今日出院，停长期医嘱', category: TaskCategory.ORDER, weekday: null, isHolidayDependent: false, holidayRule: null, isOnceOnly: false, isActive: true, order: 1 },
          { title: '填写病案首页，归档病历', category: TaskCategory.DISCHARGE, weekday: null, isHolidayDependent: false, holidayRule: null, isOnceOnly: false, isActive: true, order: 2 },
        ],
      },
    ],
  },
]
