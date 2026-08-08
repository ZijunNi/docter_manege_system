import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '../components/layout/Header'
import { useAllEventTypes } from '../hooks/useEventTypes'
import { deleteEventType } from '../services/event-service'
import { generateDailyTasks } from '../engine/task-generator'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { EmptyState } from '../components/ui/EmptyState'
import { cn } from '../utils/cn'

export function TemplateListPage() {
  const navigate = useNavigate()
  const { eventTypes, loading } = useAllEventTypes()
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)

  const handleDelete = async () => {
    if (deleteTarget === null) return
    await deleteEventType(deleteTarget)
    await generateDailyTasks()
    setDeleteTarget(null)
  }

  return (
    <div>
      <Header title="事件模板" />

      <div className="px-4 py-4 flex flex-col gap-3">
        {loading ? (
          <LoadingSpinner />
        ) : eventTypes.length === 0 ? (
          <EmptyState title="暂无事件模板" description="点击下方按钮创建自定义事件模板" />
        ) : (
          eventTypes.map(et => (
            <div
              key={et.id}
              onClick={() => navigate(`/templates/${et.id}`)}
              className={cn(
                'border-l-4 rounded-lg p-4 shadow-sm cursor-pointer active:scale-[0.98] transition-transform bg-white',
                et.color || 'border-l-gray-300'
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{et.icon}</span>
                  <div>
                    <h3 className="font-semibold text-gray-900">{et.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      {et.isBuiltIn ? (
                        <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">内置</span>
                      ) : (
                        <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">自定义</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-gray-400 text-sm">›</span>
                </div>
              </div>
            </div>
          ))
        )}

        {/* 新建按钮 */}
        <button
          onClick={() => navigate('/templates/new')}
          className="w-full py-3 text-center text-blue-600 font-medium bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
        >
          ＋ 新建事件模板
        </button>

        {/* 提示 */}
        <p className="text-xs text-gray-400 text-center mt-2">
          内置事件模板不可删除，但可以编辑其中的任务
        </p>
      </div>

      {/* 删除确认 */}
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        title="删除事件模板"
        message="删除后将移除所有关联患者的该事件配置，确定继续吗？"
        confirmText="确认删除"
      />
    </div>
  )
}
