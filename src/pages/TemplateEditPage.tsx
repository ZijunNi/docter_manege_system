import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Header } from '../components/layout/Header'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { EmptyState } from '../components/ui/EmptyState'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { useEventTypeDetail } from '../hooks/useEventTypes'
import type { EventType, EventRange, EventRangeTask } from '../types/event'
import { TaskCategory, TaskCategoryLabel, HolidayRule } from '../types/enums'
import {
  createEventType, updateEventType, deleteEventType,
  getRangesByEventTypeId, createEventRange, updateEventRange, deleteEventRange,
  getTasksByRangeId, createEventRangeTask, updateEventRangeTask, deleteEventRangeTask,
} from '../services/event-service'
import { generateDailyTasks } from '../engine/task-generator'

// ====== 预设颜色 ======
const COLOR_OPTIONS = [
  { value: 'border-l-red-500 bg-red-50', label: '红色', dot: 'bg-red-500' },
  { value: 'border-l-orange-500 bg-orange-50', label: '橙色', dot: 'bg-orange-500' },
  { value: 'border-l-yellow-500 bg-yellow-50', label: '黄色', dot: 'bg-yellow-500' },
  { value: 'border-l-green-500 bg-green-50', label: '绿色', dot: 'bg-green-500' },
  { value: 'border-l-blue-500 bg-blue-50', label: '蓝色', dot: 'bg-blue-500' },
  { value: 'border-l-blue-600 bg-blue-100', label: '深蓝', dot: 'bg-blue-600' },
  { value: 'border-l-purple-500 bg-purple-50', label: '紫色', dot: 'bg-purple-500' },
  { value: 'border-l-indigo-500 bg-indigo-50', label: '靛蓝', dot: 'bg-indigo-500' },
  { value: 'border-l-amber-500 bg-amber-50', label: '琥珀', dot: 'bg-amber-500' },
  { value: 'border-l-gray-400 bg-gray-100', label: '灰色', dot: 'bg-gray-400' },
]

// ====== 常用 Emoji ======
const EMOJI_OPTIONS = ['🏥', '🔪', '🏠', '💉', '🩺', '💊', '🩻', '🧪', '📋', '🩹', '🫀', '🧬', '🔬', '⚕️', '🩸']

/** 偏移量转自然语言：0→"当日", -3→"前3天", +3→"后3天", null→"不限" */
function offsetToLabel(offset: number | null | undefined): string {
  if (offset === null || offset === undefined) return '不限'
  if (offset === 0) return '当日'
  if (offset < 0) return `前${Math.abs(offset)}天`
  return `后${offset}天`
}

/** 范围偏移描述，如 "前1天 ~ 当日" */
function rangeOffsetLabel(start: number | null | undefined, end: number | null | undefined, useWorkday: boolean): string {
  const suffix = useWorkday ? '（工作日）' : ''
  return `${offsetToLabel(start)} ~ ${offsetToLabel(end)}${suffix}`
}

/** 哨兵值：-365 表示无下限，365 表示无上限 */
const UNBOUNDED_START = -365
const UNBOUNDED_END = 365

type OffsetMode = 'unbounded' | 'today' | 'before' | 'after'

/** 内部偏移值 → UI 模式 + 天数 */
function offsetToMode(val: number | null | undefined): { mode: OffsetMode; days: number } {
  if (val === null || val === undefined || val === UNBOUNDED_START || val === UNBOUNDED_END) {
    return { mode: 'unbounded', days: 1 }
  }
  if (val === 0) return { mode: 'today', days: 0 }
  if (val < 0) return { mode: 'before', days: Math.abs(val) }
  return { mode: 'after', days: val }
}

/** UI 模式 + 天数 → 内部偏移值（null 表示不限） */
function modeToOffset(mode: OffsetMode, days: number): number | null {
  switch (mode) {
    case 'unbounded': return null
    case 'today': return 0
    case 'before': return days > 0 ? -days : 0
    case 'after': return days > 0 ? days : 0
  }
}

/** 偏移量选择器：不限 / 当日 / 前N天 / 后N天 */
function OffsetField({ label, value, onChange }: {
  label: string
  value: number | null | undefined
  onChange: (v: number | null) => void
}) {
  const { mode, days } = offsetToMode(value)

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-500">{label}</label>
      <div className="flex items-center gap-1">
        <select
          value={mode}
          onChange={e => {
            const newMode = e.target.value as OffsetMode
            // 从"当日"切换到"前/后"时，days 默认从 1 开始
            const newDays = (newMode === 'before' || newMode === 'after') && days < 1 ? 1 : days
            onChange(modeToOffset(newMode, newDays))
          }}
          className="px-1.5 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 flex-shrink-0"
        >
          <option value="unbounded">不限</option>
          <option value="today">当日</option>
          <option value="before">前</option>
          <option value="after">后</option>
        </select>
        {(mode === 'before' || mode === 'after') && (
          <>
            <input
              type="number"
              min={1}
              value={days}
              onChange={e => {
                const d = parseInt(e.target.value) || 1
                onChange(modeToOffset(mode, d > 0 ? d : 1))
              }}
              className="w-12 px-1.5 py-1.5 border border-gray-300 rounded text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-500 flex-shrink-0">天</span>
          </>
        )}
      </div>
    </div>
  )
}

export function TemplateEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = !id || id === 'new'
  const { detail, loading } = useEventTypeDetail(isNew ? undefined : Number(id))

  // ====== EventType 状态 ======
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('📋')
  const [color, setColor] = useState(COLOR_OPTIONS[0].value)
  const [isBuiltIn, setIsBuiltIn] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  // ====== Ranges 状态 ======
  const [ranges, setRanges] = useState<Array<{
    tempId: string
    data: Partial<EventRange>
    tasks: Array<{ tempId: string; data: Partial<EventRangeTask> }>
    expanded: boolean
  }>>([])

  // ====== 验证 ======
  const rangeErrors = ranges.map(range => {
    const start = range.data.dayOffsetStart ?? UNBOUNDED_START
    const end = range.data.dayOffsetEnd ?? UNBOUNDED_END
    if (start > end) return '开始时间不能晚于结束时间'
    return null
  })
  const hasRangeError = rangeErrors.some(e => e !== null)

  // 初始化编辑模式
  useEffect(() => {
    if (!detail || isNew) return
    setName(detail.eventType.name)
    setIcon(detail.eventType.icon)
    setColor(detail.eventType.color)
    setIsBuiltIn(detail.eventType.isBuiltIn)

    setRanges(detail.ranges.map(r => ({
      tempId: `existing-${r.range.id}`,
      data: { ...r.range },
      tasks: r.tasks.map(t => ({
        tempId: `existing-${t.id}`,
        data: { ...t },
      })),
      expanded: false,
    })))
  }, [detail, isNew])

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      let eventTypeId: number

      if (isNew) {
        // key 自动生成，用户无需关心
        const autoKey = `custom-${Date.now().toString(36)}`
        eventTypeId = await createEventType({
          name: name.trim(),
          key: autoKey,
          icon,
          color,
          isBuiltIn: false,
          isActive: true,
          order: 100,
        })
      } else {
        eventTypeId = Number(id)
        await updateEventType(eventTypeId, {
          name: name.trim(),
          icon,
          color,
        })
      }

      // 同步 ranges 和 tasks
      const existingRanges = isNew ? [] : await getRangesByEventTypeId(eventTypeId)
      const keptRangeIds = new Set<number>()

      for (const range of ranges) {
        const rangeData: Omit<EventRange, 'id'> = {
          eventTypeId,
          name: range.data.name || '',
          statusLabel: range.data.name || '',   // 自动取名称，不再让用户单独填写
          color,        // 所有范围统一使用模板颜色
          dayOffsetStart: range.data.dayOffsetStart ?? UNBOUNDED_START,
          dayOffsetEnd: range.data.dayOffsetEnd ?? UNBOUNDED_END,
          useWorkdayOffset: range.data.useWorkdayOffset || false,
          order: range.data.order || 0,
        }

        let rangeId: number
        if (range.tempId.startsWith('existing-')) {
          rangeId = range.data.id!
          await updateEventRange(rangeId, rangeData)
        } else {
          rangeId = await createEventRange(rangeData)
        }
        keptRangeIds.add(rangeId)

        // 同步 tasks
        const existingTasks = isNew ? [] : await getTasksByRangeId(rangeId)
        const keptTaskIds = new Set<number>()

        for (const task of range.tasks) {
          const taskData: Omit<EventRangeTask, 'id'> = {
            eventRangeId: rangeId,
            key: task.data.key || undefined,
            title: task.data.title || '',
            description: task.data.description || undefined,
            category: task.data.category || TaskCategory.OTHER,
            weekdays: task.data.weekdays || [],
            onlyOnWorkday: task.data.onlyOnWorkday || false,
            onlyOnNonWorkday: task.data.onlyOnNonWorkday || false,
            isHolidayDependent: task.data.isHolidayDependent || false,
            holidayRule: task.data.holidayRule || null,
            isOnceOnly: task.data.isOnceOnly || false,
            isActive: task.data.isActive ?? true,
            order: task.data.order || 0,
          }

          if (task.tempId.startsWith('existing-')) {
            await updateEventRangeTask(task.data.id!, taskData)
            keptTaskIds.add(task.data.id!)
          } else {
            const newId = await createEventRangeTask(taskData)
            keptTaskIds.add(newId)
          }
        }

        // 删除已移除的 tasks
        for (const t of existingTasks) {
          if (!keptTaskIds.has(t.id!)) {
            await deleteEventRangeTask(t.id!)
          }
        }
      }

      // 删除已移除的 ranges
      for (const r of existingRanges) {
        if (!keptRangeIds.has(r.id!)) {
          await deleteEventRange(r.id!)
        }
      }

      await generateDailyTasks()
      navigate('/templates')
    } catch (err) {
      console.error('Failed to save event type:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (isNew || !id) return
    await deleteEventType(Number(id))
    await generateDailyTasks()
    navigate('/templates')
  }

  // ====== Range 操作 ======
  const addRange = () => {
    setRanges(prev => [...prev, {
      tempId: `new-${Date.now()}`,
      data: {
        name: '',
        dayOffsetStart: 0,
        dayOffsetEnd: 0,
        useWorkdayOffset: false,
        order: prev.length,
      },
      tasks: [],
      expanded: true,
    }])
  }

  const updateRangeField = (tempId: string, field: keyof EventRange, value: unknown) => {
    setRanges(prev => prev.map(r =>
      r.tempId === tempId ? { ...r, data: { ...r.data, [field]: value } } : r
    ))
  }

  const removeRange = (tempId: string) => {
    setRanges(prev => prev.filter(r => r.tempId !== tempId))
  }

  const toggleRangeExpanded = (tempId: string) => {
    setRanges(prev => prev.map(r =>
      r.tempId === tempId ? { ...r, expanded: !r.expanded } : r
    ))
  }

  // ====== Task 操作 ======
  const addTask = (rangeTempId: string) => {
    setRanges(prev => prev.map(r => {
      if (r.tempId !== rangeTempId) return r
      return {
        ...r,
        tasks: [...r.tasks, {
          tempId: `new-task-${Date.now()}`,
          data: {
            title: '',
            category: TaskCategory.OTHER,
            weekdays: [],
            onlyOnWorkday: false,
            onlyOnNonWorkday: false,
            isHolidayDependent: false,
            holidayRule: null,
            isOnceOnly: false,
            isActive: true,
            order: r.tasks.length,
          },
        }],
      }
    }))
  }

  const updateTaskField = (rangeTempId: string, taskTempId: string, field: keyof EventRangeTask, value: unknown) => {
    setRanges(prev => prev.map(r => {
      if (r.tempId !== rangeTempId) return r
      return {
        ...r,
        tasks: r.tasks.map(t =>
          t.tempId === taskTempId ? { ...t, data: { ...t.data, [field]: value } } : t
        ),
      }
    }))
  }

  const removeTask = (rangeTempId: string, taskTempId: string) => {
    setRanges(prev => prev.map(r => {
      if (r.tempId !== rangeTempId) return r
      return { ...r, tasks: r.tasks.filter(t => t.tempId !== taskTempId) }
    }))
  }

  // ====== Loading ======
  if (!isNew && loading) {
    return (
      <div>
        <Header title="编辑模板" showBack onBack={() => navigate('/templates')} />
        <LoadingSpinner />
      </div>
    )
  }

  if (!isNew && !loading && !detail) {
    return (
      <div>
        <Header title="编辑模板" showBack onBack={() => navigate('/templates')} />
        <EmptyState title="模板未找到" />
      </div>
    )
  }

  return (
    <div>
      <Header
        title={isNew ? '新建模板' : `编辑模板`}
        showBack
        onBack={() => navigate('/templates')}
      />

      <div className="px-4 py-4 flex flex-col gap-4 pb-24">
        {/* ====== 基本信息 ====== */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-gray-700">事件基本信息</h3>

          {/* 名称 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">名称</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="如：手术"
              disabled={isBuiltIn}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
          </div>

          {/* Icon */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">图标</label>
            <div className="flex flex-wrap gap-1">
              {EMOJI_OPTIONS.map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  className={`w-9 h-9 text-lg flex items-center justify-center rounded-lg border-2 transition-colors ${icon === emoji ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">颜色</label>
            <div className="flex flex-wrap gap-1">
              {COLOR_OPTIONS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`w-8 h-8 rounded-full border-2 transition-colors ${c.dot} ${color === c.value ? 'border-gray-800 scale-110' : 'border-gray-200 hover:border-gray-400'}`}
                  title={c.label}
                />
              ))}
            </div>
          </div>

        </div>

        {/* ====== 日期范围列表 ====== */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">日期范围</h3>
            <button
              type="button"
              onClick={addRange}
              className="text-xs text-blue-600 font-medium"
            >
              ＋ 添加范围
            </button>
          </div>

          {ranges.map((range, rangeIdx) => (
            <div key={range.tempId} className={`bg-white rounded-lg shadow-sm border overflow-hidden ${rangeErrors[rangeIdx] ? 'border-red-300' : 'border-gray-100'}`}>
              {/* Range Header */}
              <div
                onClick={() => toggleRangeExpanded(range.tempId)}
                className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">
                    {range.data.name || `范围 ${rangeIdx + 1}`}
                  </span>
                  <span className="text-xs text-gray-400">
                    {rangeOffsetLabel(
                      range.data.dayOffsetStart,
                      range.data.dayOffsetEnd,
                      range.data.useWorkdayOffset || false
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {!isBuiltIn && (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); removeRange(range.tempId) }}
                      className="text-xs text-red-500"
                    >
                      删除
                    </button>
                  )}
                  <span className="text-gray-400 text-sm">{range.expanded ? '▾' : '▸'}</span>
                </div>
              </div>

              {/* Range Detail */}
              {range.expanded && (
                <div className="px-4 py-3 border-t border-gray-100 flex flex-col gap-3">
                  {/* Range fields */}
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-gray-500">名称</label>
                      <input
                        type="text"
                        value={range.data.name || ''}
                        onChange={e => updateRangeField(range.tempId, 'name', e.target.value)}
                        placeholder="如：术前一天"
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-[10px] text-gray-400">将显示在患者状态标签中</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <OffsetField
                        label="开始时间"
                        value={range.data.dayOffsetStart}
                        onChange={v => updateRangeField(range.tempId, 'dayOffsetStart', v)}
                      />
                      <OffsetField
                        label="结束时间"
                        value={range.data.dayOffsetEnd}
                        onChange={v => updateRangeField(range.tempId, 'dayOffsetEnd', v)}
                      />
                    </div>
                    {rangeErrors[rangeIdx] && (
                      <p className="text-xs text-red-500">{rangeErrors[rangeIdx]}</p>
                    )}
                  </div>

                  {/* Workday offset toggle */}
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-gray-500">排除假期</label>
                    <button
                      type="button"
                      onClick={() => updateRangeField(range.tempId, 'useWorkdayOffset', !range.data.useWorkdayOffset)}
                      className={`relative w-10 h-5 rounded-full transition-colors ${range.data.useWorkdayOffset ? 'bg-blue-600' : 'bg-gray-300'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${range.data.useWorkdayOffset ? 'translate-x-5' : ''}`} />
                    </button>
                  </div>

                  {/* Tasks */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-gray-500">待办任务</label>
                      <button
                        type="button"
                        onClick={() => addTask(range.tempId)}
                        className="text-xs text-blue-600 font-medium"
                      >
                        ＋ 添加任务
                      </button>
                    </div>

                    {range.tasks.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2">暂无任务，点击上方按钮添加</p>
                    ) : (
                      <div className="flex flex-col gap-2 mt-1">
                        {range.tasks.map((task, taskIdx) => (
                          <div key={task.tempId} className="bg-gray-50 rounded-lg p-3 flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-gray-600">任务 {taskIdx + 1}</span>
                              <button
                                type="button"
                                onClick={() => removeTask(range.tempId, task.tempId)}
                                className="text-xs text-red-500"
                              >
                                删除
                              </button>
                            </div>

                            <input
                              type="text"
                              value={task.data.title || ''}
                              onChange={e => updateTaskField(range.tempId, task.tempId, 'title', e.target.value)}
                              placeholder="任务标题"
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />

                            <input
                              type="text"
                              value={task.data.description || ''}
                              onChange={e => updateTaskField(range.tempId, task.tempId, 'description', e.target.value || undefined)}
                              placeholder="描述（可选）"
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />

                            <div className="grid grid-cols-2 gap-2">
                              {/* Category */}
                              <div className="flex flex-col gap-1">
                                <label className="text-xs text-gray-400">分类</label>
                                <select
                                  value={task.data.category || TaskCategory.OTHER}
                                  onChange={e => updateTaskField(range.tempId, task.tempId, 'category', e.target.value)}
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                  {Object.entries(TaskCategoryLabel).map(([value, label]) => (
                                    <option key={value} value={value}>{label}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Weekday 多选 */}
                              <div className="flex flex-col gap-1">
                                <label className="text-xs text-gray-400">每周</label>
                                <div className="flex flex-wrap gap-1">
                                  {[
                                    { value: 1, label: '一' },
                                    { value: 2, label: '二' },
                                    { value: 3, label: '三' },
                                    { value: 4, label: '四' },
                                    { value: 5, label: '五' },
                                    { value: 6, label: '六' },
                                    { value: 0, label: '日' },
                                  ].map(({ value, label }) => {
                                    const weekdays = task.data.weekdays || []
                                    const active = weekdays.includes(value)
                                    return (
                                      <button
                                        key={value}
                                        type="button"
                                        onClick={() => {
                                          const next = active
                                            ? weekdays.filter((d: number) => d !== value)
                                            : [...weekdays, value]
                                          updateTaskField(range.tempId, task.tempId, 'weekdays', next)
                                        }}
                                        className={`w-8 h-7 text-xs rounded border transition-colors ${
                                          active
                                            ? 'bg-blue-600 text-white border-blue-600'
                                            : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                                        }`}
                                      >
                                        {label}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-4 flex-wrap">
                              {/* 限定日期（原"假期依赖"） */}
                              <label className="flex items-center gap-1 text-xs text-gray-500">
                                <input
                                  type="checkbox"
                                  checked={task.data.isHolidayDependent || false}
                                  onChange={e => {
                                    updateTaskField(range.tempId, task.tempId, 'isHolidayDependent', e.target.checked)
                                    if (!e.target.checked) {
                                      updateTaskField(range.tempId, task.tempId, 'holidayRule', null)
                                    }
                                  }}
                                  className="rounded"
                                />
                                限定日期
                              </label>

                              {task.data.isHolidayDependent && (
                                <select
                                  value={task.data.holidayRule || ''}
                                  onChange={e => updateTaskField(range.tempId, task.tempId, 'holidayRule', e.target.value || null)}
                                  className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none"
                                >
                                  <option value="">选择条件</option>
                                  <option value={HolidayRule.BEFORE_HOLIDAY}>节假日前一天</option>
                                  <option value={HolidayRule.NON_WORKDAY}>周末及节假日</option>
                                </select>
                              )}

                              {/* 仅工作日 / 仅非工作日 */}
                              <label className="flex items-center gap-1 text-xs text-gray-500">
                                <input
                                  type="checkbox"
                                  checked={task.data.onlyOnWorkday || false}
                                  onChange={e => {
                                    updateTaskField(range.tempId, task.tempId, 'onlyOnWorkday', e.target.checked)
                                    if (e.target.checked) {
                                      updateTaskField(range.tempId, task.tempId, 'onlyOnNonWorkday', false)
                                    }
                                  }}
                                  className="rounded"
                                />
                                仅工作日
                              </label>
                              <label className="flex items-center gap-1 text-xs text-gray-500">
                                <input
                                  type="checkbox"
                                  checked={task.data.onlyOnNonWorkday || false}
                                  onChange={e => {
                                    updateTaskField(range.tempId, task.tempId, 'onlyOnNonWorkday', e.target.checked)
                                    if (e.target.checked) {
                                      updateTaskField(range.tempId, task.tempId, 'onlyOnWorkday', false)
                                    }
                                  }}
                                  className="rounded"
                                />
                                仅非工作日
                              </label>

                              {/* 一次性任务 */}
                              <label className="flex items-center gap-1 text-xs text-gray-500">
                                <input
                                  type="checkbox"
                                  checked={task.data.isOnceOnly || false}
                                  onChange={e => updateTaskField(range.tempId, task.tempId, 'isOnceOnly', e.target.checked)}
                                  className="rounded"
                                />
                                只做一次
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {ranges.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">暂无日期范围，点击上方按钮添加</p>
          )}
        </div>

        {/* ====== 保存/删除按钮 ====== */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate('/templates')}
            className="flex-1 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim() || hasRangeError}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            title={hasRangeError ? '请先修正日期范围的错误' : undefined}
          >
            {saving ? '保存中...' : '保存模板'}
          </button>
        </div>

        {!isNew && !isBuiltIn && (
          <button
            type="button"
            onClick={() => setShowDelete(true)}
            className="w-full py-2.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
          >
            🗑 删除此模板
          </button>
        )}
      </div>

      {/* 删除确认 */}
      <ConfirmDialog
        isOpen={showDelete}
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
        title="删除事件模板"
        message="删除后将移除所有关联患者的该事件配置，确定继续吗？"
        confirmText="确认删除"
      />
    </div>
  )
}
