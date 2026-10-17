import { useState, useEffect, useRef } from 'react'
import { Folder, ChevronDown, Check, Loader2, Pencil, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorkspaceStore } from '@/stores/workspace'

interface Workspace {
  tenant_id: string
  project_id: string
  name?: string
  code?: string
  description?: string
  active_version: string
  is_current: boolean
}

function getProjectDisplayName(ws?: Workspace): string {
  if (!ws) return '平台默认项目'
  if (ws.name && ws.name !== ws.project_id) {
    return ws.name
  }
  if (ws.project_id === '11111111-1111-4111-8111-111111111111') {
    return '平台默认项目'
  }
  if (ws.project_id === 'eval_benchmark') {
    return '评测基准 (eval_benchmark)'
  }
  if (ws.project_id.length > 16) {
    return `${ws.project_id.slice(0, 8)}...${ws.project_id.slice(-4)}`
  }
  return ws.project_id
}

export default function ProjectSelector() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savingMeta, setSavingMeta] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const fetchWorkspaces = async () => {
    try {
      setLoading(true)
      const res = await fetch('/ops/workspaces')
      if (res.ok) {
        const data = await res.json()
        if (data.workspaces && Array.isArray(data.workspaces)) {
          setWorkspaces(data.workspaces)
          const current = data.workspaces.find((w: Workspace) => w.is_current)
          if (current) {
            useWorkspaceStore.setState({
              currentTenantId: current.tenant_id,
              currentProjectId: current.project_id
            })
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load workspaces:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWorkspaces()
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setEditingKey(null)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const currentWorkspace = workspaces.find((w) => w.is_current)
  const displayName = getProjectDisplayName(currentWorkspace)

  const handleSelect = async (ws: Workspace) => {
    if (ws.is_current || switching || editingKey) return
    try {
      setSwitching(true)
      const res = await fetch('/ops/workspaces/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: ws.tenant_id,
          project_id: ws.project_id
        })
      })
      if (res.ok) {
        // Optimistically update workspace list without full-page reload
        setWorkspaces((prev) =>
          prev.map((item) => ({
            ...item,
            is_current: item.tenant_id === ws.tenant_id && item.project_id === ws.project_id
          }))
        )
        useWorkspaceStore.getState().setCurrentWorkspace(ws.tenant_id, ws.project_id)
        setIsOpen(false)
      } else {
        alert('切换工作区失败，请查看控制台日志')
      }
    } catch (err) {
      console.error('Error selecting workspace:', err)
      alert('切换工作区网络异常')
    } finally {
      setSwitching(false)
    }
  }

  const handleStartEdit = (e: React.MouseEvent, ws: Workspace) => {
    e.stopPropagation()
    setEditingKey(`${ws.tenant_id}:${ws.project_id}`)
    setEditValue(ws.name || '')
  }

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingKey(null)
    setEditValue('')
  }

  const handleSaveMeta = async (e: React.MouseEvent | React.FormEvent, ws: Workspace) => {
    e.stopPropagation()
    e.preventDefault()
    if (!editValue.trim() || savingMeta) return

    try {
      setSavingMeta(true)
      const res = await fetch(`/ops/workspaces/${encodeURIComponent(ws.tenant_id)}/${encodeURIComponent(ws.project_id)}/meta`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editValue.trim(),
          code: ws.code,
          description: ws.description || ''
        })
      })

      if (res.ok) {
        const result = await res.json()
        const updatedName = result.metadata?.name || editValue.trim()
        setWorkspaces((prev) =>
          prev.map((item) =>
            item.tenant_id === ws.tenant_id && item.project_id === ws.project_id
              ? { ...item, name: updatedName }
              : item
          )
        )
        setEditingKey(null)
      } else {
        alert('保存项目元数据失败')
      }
    } catch (err) {
      console.error('Failed to save project meta:', err)
      alert('保存元数据网络异常')
    } finally {
      setSavingMeta(false)
    }
  }

  return (
    <div className="relative inline-block text-left notranslate" translate="no" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={switching}
        className={cn(
          'inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-md transition-colors',
          'bg-muted/50 hover:bg-muted text-foreground border border-border/50 cursor-pointer',
          'focus:outline-none focus:ring-1 focus:ring-emerald-500/50',
          switching && 'opacity-60 cursor-wait'
        )}
      >
        <Folder className="size-3.5 text-emerald-500 shrink-0" />
        <span className="truncate max-w-[140px] font-medium">{displayName}</span>
        {currentWorkspace?.active_version && (
          <span className="text-[10px] px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono">
            {currentWorkspace.active_version}
          </span>
        )}
        {switching ? (
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
        ) : (
          <ChevronDown className={cn('size-3 text-muted-foreground transition-transform duration-200', isOpen && 'rotate-180')} />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-80 rounded-lg border border-border/80 bg-popover/95 backdrop-blur-md shadow-2xl z-50 py-1 text-popover-foreground animate-in fade-in-0 zoom-in-95">
          <div className="px-3 py-1.5 border-b border-border/40 flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold text-foreground/80">选择知识库项目</span>
            {loading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {workspaces.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                {loading ? '正在检索多租户工作区...' : '暂无其他多租户工作区'}
              </div>
            ) : (
              workspaces.map((ws) => {
                const isSelected = ws.is_current
                const key = `${ws.tenant_id}:${ws.project_id}`
                const isEditing = editingKey === key
                const titleName = ws.name || getProjectDisplayName(ws)
                const isRawUuid = ws.project_id.length > 16 && (!ws.name || ws.name === ws.project_id)

                return (
                  <div
                    key={key}
                    onClick={() => !isEditing && handleSelect(ws)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors',
                      !isEditing && 'cursor-pointer',
                      isSelected
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium'
                        : 'hover:bg-muted/60 text-foreground'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2 flex-1">
                      <Folder className={cn('size-3.5 shrink-0', isSelected ? 'text-emerald-500' : 'text-muted-foreground')} />
                      
                      {isEditing ? (
                        <form onSubmit={(e) => handleSaveMeta(e, ws)} className="flex items-center gap-1.5 flex-1" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            placeholder="输入项目友好名称"
                            autoFocus
                            disabled={savingMeta}
                            className="w-full text-xs px-2 py-0.5 rounded border border-emerald-500 bg-background text-foreground focus:outline-none"
                          />
                          <button
                            type="submit"
                            disabled={savingMeta}
                            className="p-1 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded cursor-pointer"
                            title="保存"
                          >
                            <Check className="size-3" />
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="p-1 hover:bg-destructive/20 text-muted-foreground hover:text-destructive rounded cursor-pointer"
                            title="取消"
                          >
                            <X className="size-3" />
                          </button>
                        </form>
                      ) : (
                        <div className="truncate flex flex-col flex-1">
                          <span className={cn('truncate', isRawUuid ? 'font-mono text-muted-foreground' : 'font-medium')}>
                            {titleName}
                          </span>
                          <span className="text-[10px] text-muted-foreground/80 font-mono truncate flex items-center gap-1">
                            {ws.project_id !== titleName && (
                              <span className="truncate">{ws.project_id.slice(0, 8)}...</span>
                            )}
                            <span>· {ws.active_version}</span>
                          </span>
                        </div>
                      )}
                    </div>

                    {!isEditing && (
                      <div className="flex items-center gap-1.5 shrink-0 ml-1">
                        <button
                          type="button"
                          onClick={(e) => handleStartEdit(e, ws)}
                          className="p-1 rounded opacity-40 hover:opacity-100 hover:bg-muted text-muted-foreground hover:text-foreground transition-opacity cursor-pointer"
                          title="修改项目别名"
                        >
                          <Pencil className="size-3" />
                        </button>
                        {isSelected && (
                          <Check className="size-3.5 text-emerald-500 font-bold" />
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
