export enum TaskCategory {
  MEDICAL_RECORD = 'medical_record',
  ORDER          = 'order',
  PRINT          = 'print',
  SIGN           = 'sign',
  ECG            = 'ecg',
  SURGERY        = 'surgery',
  DISCHARGE      = 'discharge',
  OTHER          = 'other',
}

export const TaskCategoryLabel: Record<TaskCategory, string> = {
  [TaskCategory.MEDICAL_RECORD]: '病历',
  [TaskCategory.ORDER]:          '医嘱',
  [TaskCategory.PRINT]:          '打印',
  [TaskCategory.SIGN]:           '签字',
  [TaskCategory.ECG]:            '心电图',
  [TaskCategory.SURGERY]:        '手术',
  [TaskCategory.DISCHARGE]:      '出院',
  [TaskCategory.OTHER]:          '其他',
}

export enum HolidayRule {
  BEFORE_HOLIDAY = 'before_holiday',
  NON_WORKDAY    = 'non_workday',
  ONLY_WORKDAY   = 'only_workday',
}
