const LEGACY_STATUS_ALIASES: Record<string, string> = {
  '常规在院': '在院',
  '入院第三天（非工作日）': '在院',
  '术前准备期': '术前准备',
}

/** 将旧版展示名称归一化为当前事件范围名称，仅用于兼容导入和唯一任务匹配。 */
export function normalizeTaskStatusLabel(statusLabel: string): string {
  return LEGACY_STATUS_ALIASES[statusLabel] || statusLabel
}
