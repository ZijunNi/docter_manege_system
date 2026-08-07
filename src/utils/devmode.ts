const DEV_MODE_KEY = 'devModeEnabled'
const OVERRIDE_DATE_KEY = 'devModeOverrideDate'

/**
 * 开发模式：允许手动指定"今天"日期，方便测试不同场景
 * 状态存储在 localStorage 中（不跟踪入 git）
 */

export function isDevModeEnabled(): boolean {
  return localStorage.getItem(DEV_MODE_KEY) === 'true'
}

export function setDevModeEnabled(enabled: boolean): void {
  localStorage.setItem(DEV_MODE_KEY, String(enabled))
  if (!enabled) {
    localStorage.removeItem(OVERRIDE_DATE_KEY)
  }
}

export function getOverrideDate(): string | null {
  if (!isDevModeEnabled()) return null
  return localStorage.getItem(OVERRIDE_DATE_KEY)
}

export function setOverrideDate(date: string): void {
  localStorage.setItem(OVERRIDE_DATE_KEY, date)
}
