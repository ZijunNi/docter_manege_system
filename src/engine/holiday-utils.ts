import { isWeekend, addDays } from '../utils/date'

// 中国法定节假日（2025-2026），需要每年更新
const HOLIDAYS_2025: string[] = [
  '2025-01-01', // 元旦
  '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31', '2025-02-01', '2025-02-02', '2025-02-03', // 春节
  '2025-04-04', '2025-04-05', '2025-04-06', // 清明节
  '2025-05-01', '2025-05-02', '2025-05-03', '2025-05-04', '2025-05-05', // 劳动节
  '2025-05-31', '2025-06-01', '2025-06-02', // 端午节
  '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-04', '2025-10-05', '2025-10-06', '2025-10-07', '2025-10-08', // 国庆+中秋
]

const HOLIDAYS_2026: string[] = [
  '2026-01-01', '2026-01-02', '2026-01-03', // 元旦
  '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23', // 春节
  '2026-04-05', '2026-04-06', // 清明节
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05', // 劳动节
  '2026-06-19', '2026-06-20', '2026-06-21', // 端午节
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', // 国庆
]

// 调休工作日（周六日上班）
const WORKDAYS_2025: string[] = [
  '2025-01-26', // 春节调休
  '2025-02-08', // 春节调休
  '2025-04-27', // 五一调休
  '2025-09-28', // 国庆调休
  '2025-10-11', // 国庆调休
]

const WORKDAYS_2026: string[] = [
  '2026-02-14', // 春节调休
  '2026-02-28', // 春节调休
  '2026-05-09', // 五一调休
  '2026-09-27', // 国庆调休
  '2026-10-10', // 国庆调休
]

const ALL_HOLIDAYS = new Set([...HOLIDAYS_2025, ...HOLIDAYS_2026])
const ALL_WORKDAYS = new Set([...WORKDAYS_2025, ...WORKDAYS_2026])

export function isHoliday(date: string): boolean {
  return ALL_HOLIDAYS.has(date)
}

export function isWorkday(date: string): boolean {
  if (ALL_WORKDAYS.has(date)) return true
  if (ALL_HOLIDAYS.has(date)) return false
  return !isWeekend(date)
}

export function isNonWorkday(date: string): boolean {
  return !isWorkday(date)
}

export function isDayBeforeHoliday(date: string): boolean {
  const tomorrow = addDays(date, 1)
  return isNonWorkday(tomorrow)
}

export function getNextWorkday(date: string): string {
  let next = addDays(date, 1)
  while (isNonWorkday(next)) {
    next = addDays(next, 1)
  }
  return next
}

/**
 * 计算两个日期之间的工作日偏移（按工作日计数，正向或反向）
 *
 * @param fromDate - 起始日期（通常是事件日期）
 * @param toDate - 目标日期（通常是 targetDate）
 * @returns 正数 = toDate 是 fromDate 之后的第 N 个工作日
 *          0 = 同一天（且是工作日）
 *          负数 = toDate 是 fromDate 之前的第 N 个工作日
 *
 * 例：fromDate=周一, toDate=前一个周五 → 返回 -1（1 个工作日前）
 *     fromDate=周一, toDate=周三 → 返回 2（2 个工作日后）
 *     fromDate=周五, toDate=周一 → 返回 1（1 个工作日后，跳过周末）
 */
export function countWorkdaysBetween(fromDate: string, toDate: string): number {
  if (fromDate === toDate) return 0

  const direction = toDate > fromDate ? 1 : -1
  let count = 0
  let cursor = fromDate

  while (true) {
    cursor = addDays(cursor, direction)
    if (direction === 1 && cursor > toDate) break
    if (direction === -1 && cursor < toDate) break

    if (isWorkday(cursor)) {
      count += direction
    }

    if (cursor === toDate) break
  }

  return count
}
