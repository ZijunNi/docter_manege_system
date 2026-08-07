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
