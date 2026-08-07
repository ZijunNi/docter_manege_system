export enum PatientStatus {
  DAY0_ADMISSION   = 'day0_admission',
  DAY1_ADMISSION   = 'day1_admission',
  NORMAL_INPATIENT = 'normal_inpatient',
  SURGERY_PRE      = 'surgery_pre',
  PRE_SURGERY      = 'pre_surgery',
  SURGERY_DAY      = 'surgery_day',
  POST_SURGERY      = 'post_surgery',
  PRE_DISCHARGE    = 'pre_discharge',
  DISCHARGE_DAY    = 'discharge_day',
  ARCHIVED         = 'archived',
}

export const PatientStatusLabel: Record<PatientStatus, string> = {
  [PatientStatus.DAY0_ADMISSION]:   '入院当日',
  [PatientStatus.DAY1_ADMISSION]:   '入院第二日',
  [PatientStatus.NORMAL_INPATIENT]: '在院',
  [PatientStatus.SURGERY_PRE]:      '术前准备',
  [PatientStatus.PRE_SURGERY]:      '术前一天',
  [PatientStatus.SURGERY_DAY]:      '手术当日',
  [PatientStatus.POST_SURGERY]:      '术后恢复',
  [PatientStatus.PRE_DISCHARGE]:    '预出院',
  [PatientStatus.DISCHARGE_DAY]:    '出院当日',
  [PatientStatus.ARCHIVED]:         '已归档',
}

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

export enum SurgeryPhase {
  ANY_TIME     = 'any_time',
  PRE_DAY      = 'pre_day',
  SURGERY_DAY  = 'surgery_day',
}

export enum HolidayRule {
  BEFORE_HOLIDAY = 'before_holiday',
  NON_WORKDAY    = 'non_workday',
}
