import { useState, useEffect, useRef } from 'react'
import { Folder, ChevronDown, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorkspaceStore } from '@/stores/workspace'

interface Workspace {
  tenant_id: string
  project_id: string
  active_version: string
  is_current: boolean
}

function friendlyProjectName(projectId: string): string {
  if (projectId === '11111111-1111-4111-8111-111111111111') {
    return '平台默认项目'
  }
  if (projectId === 'eval_benchmark') {
    return '评测基准 (eval_benchmark)'
  }
  return projectId
}

export default function ProjectSelector() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [switching, setSwitching] = useState(false)
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
  const displayName = currentWorkspace
    ? friendlyProjectName(currentWorkspace.project_id)
    : '平台默认项目'

  const handleSelect = async (ws: Workspace) => {
    if (ws.is_current || switching) return
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
        // Optimistically update workspace list without full-page blanking reload
        setWorkspaces((prev) =>
          prev.map((item) => ({
            ...item,
            is_current: item.tenant_id === ws.tenant_id && item.project_id === ws.project_id
          }))
        )
        // Trigger React views (DocumentManager, GraphViewer, RetrievalView) to cleanly re-mount
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
        <span className="truncate max-w-[130px] font-medium">{displayName}</span>
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
        <div className="absolute right-0 mt-1.5 w-72 rounded-lg border border-border/80 bg-popover/95 backdrop-blur-md shadow-2xl z-50 py-1 text-popover-foreground animate-in fade-in-0 zoom-in-95">
          <div className="px-3 py-1.5 border-b border-border/40 flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold text-foreground/80">选择知识库项目</span>
            {loading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
          </div>

          <div className="max-h-60 overflow-y-auto py-1">
            {workspaces.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                {loading ? '正在检索多租户工作区...' : '暂无其他多租户工作区'}
              </div>
            ) : (
              workspaces.map((ws) => {
                const isSelected = ws.is_current
                const name = friendlyProjectName(ws.project_id)
                return (
                  <button
                    key={`${ws.tenant_id}:${ws.project_id}`}
                    type="button"
                    onClick={() => handleSelect(ws)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors cursor-pointer',
                      isSelected
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium'
                        : 'hover:bg-muted/60 text-foreground'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <Folder className={cn('size-3.5 shrink-0', isSelected ? 'text-emerald-500' : 'text-muted-foreground')} />
                      <div className="truncate flex flex-col">
                        <span className="truncate">{name}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {ws.tenant_id !== '__default' ? `${ws.tenant_id} · ` : ''}{ws.active_version}
                        </span>
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="size-3.5 text-emerald-500 shrink-0 font-bold ml-1" />
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
