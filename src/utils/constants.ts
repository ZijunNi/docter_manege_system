export const APP_NAME = '住院医师日程管家'
export const DB_NAME = 'ResidentScheduleDB'

export const STATUS_COLORS: Record<string, string> = {
  day0_admission:   'border-l-red-500 bg-red-50',
  day1_admission:   'border-l-orange-500 bg-orange-50',
  normal_inpatient: 'border-l-green-500 bg-green-50',
  surgery_pre:      'border-l-blue-500 bg-blue-50',
  pre_surgery:      'border-l-blue-600 bg-blue-100',
  surgery_day:      'border-l-purple-500 bg-purple-50',
  pre_discharge:    'border-l-yellow-500 bg-yellow-50',
  discharge_day:    'border-l-amber-500 bg-amber-50',
  archived:         'border-l-gray-400 bg-gray-100',
}

export const STATUS_DOT_COLORS: Record<string, string> = {
  day0_admission:   'bg-red-500',
  day1_admission:   'bg-orange-500',
  normal_inpatient: 'bg-green-500',
  surgery_pre:      'bg-blue-500',
  pre_surgery:      'bg-blue-600',
  surgery_day:      'bg-purple-500',
  pre_discharge:    'bg-yellow-500',
  discharge_day:    'bg-amber-500',
  archived:         'bg-gray-400',
}
