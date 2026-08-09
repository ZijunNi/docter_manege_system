export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function fromISODate(iso: string): Date {
  return new Date(iso + 'T00:00:00')
}

export function diffDays(date1: string, date2: string): number {
  const d1 = fromISODate(date1)
  const d2 = fromISODate(date2)
  return Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24))
}

export function addDays(iso: string, days: number): string {
  const d = fromISODate(iso)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

export function getWeekday(iso: string): number {
  return fromISODate(iso).getDay()
}

export function getWeekdayLabel(iso: string): string {
  const labels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return labels[getWeekday(iso)]
}

export function isWeekend(iso: string): boolean {
  const d = getWeekday(iso)
  return d === 0 || d === 6
}

import { getOverrideDate } from './devmode'

export function today(): string {
  const override = getOverrideDate()
  if (override) return override
  return toISODate(new Date())
}

/** 获取系统真实日期（不受开发模式影响） */
export function realToday(): string {
  return toISODate(new Date())
}

export function formatDisplayDate(iso: string): string {
  const d = fromISODate(iso)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

export function daysAfterAdmission(admissionDate: string, targetDate: string): number {
  return diffDays(targetDate, admissionDate)
}

/**
 * 灵活解析多种日期格式，统一返回 YYYY-MM-DD。
 * 支持：20260807 / 2026-08-07 / 2026.08.07 / 2026.8.7 / 2026年8月7日
 * 返回 null 表示无法解析。
 */
export function parseFlexibleDate(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // 1. YYYYMMDD（8位纯数字）
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(trimmed)
  if (compact) {
    const [, y, m, d] = compact
    return validateAndFormat(y, m, d)
  }

  // 2. YYYY-MM-DD 或 YYYY-M-D
  const dash = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed)
  if (dash) {
    const [, y, m, d] = dash
    return validateAndFormat(y, m, d)
  }

  // 3. YYYY.M.D 或 YYYY.MM.DD
  const dot = /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/.exec(trimmed)
  if (dot) {
    const [, y, m, d] = dot
    return validateAndFormat(y, m, d)
  }

  // 4. YYYY年M月D日
  const cn = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/.exec(trimmed)
  if (cn) {
    const [, y, m, d] = cn
    return validateAndFormat(y, m, d)
  }

  return null
}

/** 校验年月日范围并格式化为 YYYY-MM-DD */
function validateAndFormat(y: string, m: string, d: string): string | null {
  const month = parseInt(m, 10)
  const day = parseInt(d, 10)
  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}
