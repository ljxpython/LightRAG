import { useState, useEffect, useRef } from 'react'
import { Folder, ChevronDown, Check, Loader2, Pencil, X, Plus, Trash2, AlertTriangle, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorkspaceStore } from '@/stores/workspace'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import { toast } from 'sonner'

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

  // 新建项目状态
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newProjectId, setNewProjectId] = useState('')
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectTenant, setNewProjectTenant] = useState('default')
  const [newProjectDesc, setNewProjectDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // 知识库集中管理面板状态
  const [manageDialogOpen, setManageDialogOpen] = useState(false)

  // 归档删除状态
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [projectToDelete, setProjectToDelete] = useState<Workspace | null>(null)
  const [deleting, setDeleting] = useState(false)

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

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    const pName = newProjectName.trim()
    if (!pName) {
      toast.error('请填写知识库名称')
      return
    }

    // 自动生成 project_id 逻辑：用户未指定时，自动生成 proj_ 开头的唯一随机 ID
    let pId = newProjectId.trim()
    if (pId) {
      if (!/^[a-zA-Z0-9_-]+$/.test(pId)) {
        toast.error('项目标识仅允许英文字母、数字、下划线及短横线')
        return
      }
    } else {
      pId = 'proj_' + Math.random().toString(36).substring(2, 10)
    }

    const pTenant = newProjectTenant.trim() || 'default'
    const pDesc = newProjectDesc.trim()

    try {
      setCreating(true)
      const res = await fetch('/ops/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: pTenant,
          project_id: pId,
          name: pName,
          description: pDesc
        })
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(`创建知识库失败: ${err.detail || '未知错误'}`)
        return
      }

      toast.success(`知识库 "${pName}" 创建成功！已自动完成初始版本封印。`)
      setCreateDialogOpen(false)
      setNewProjectId('')
      setNewProjectName('')
      setNewProjectDesc('')
      setShowAdvanced(false)
      
      // 刷新列表并自动切换至新创建项目
      const refreshRes = await fetch('/ops/workspaces')
      if (refreshRes.ok) {
        const data = await refreshRes.json()
        if (data.workspaces) setWorkspaces(data.workspaces)
      }
      await handleSelect({
        tenant_id: pTenant,
        project_id: pId,
        name: pName,
        description: pDesc,
        active_version: 'rev_1',
        is_current: false
      })
    } catch (err) {
      console.error('Failed to create project:', err)
      toast.error('创建知识库网络异常')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteProject = async () => {
    if (!projectToDelete) return
    try {
      setDeleting(true)
      const res = await fetch(
        `/ops/workspaces/${encodeURIComponent(projectToDelete.tenant_id)}/${encodeURIComponent(projectToDelete.project_id)}`,
        { method: 'DELETE' }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(`删除项目失败: ${err.detail || '未知错误'}`)
        return
      }
      toast.success(`项目 "${getProjectDisplayName(projectToDelete)}" 已安全排空并归档至回收站！`)
      setDeleteDialogOpen(false)
      const deletedWs = projectToDelete
      setProjectToDelete(null)
      
      // 刷新工作区列表
      await fetchWorkspaces()

      // 如果删除的是当前选中的项目（极端情况），自动切回默认项目
      if (deletedWs.is_current) {
        await handleSelect({
          tenant_id: 'default',
          project_id: '11111111-1111-4111-8111-111111111111',
          name: '平台默认项目',
          active_version: 'rev_1',
          is_current: false
        })
      }
    } catch (err) {
      console.error('Failed to delete project:', err)
      toast.error('删除项目网络异常')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
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
          <div className="absolute right-0 mt-1.5 w-84 rounded-lg border border-border/80 bg-popover/95 backdrop-blur-md shadow-2xl z-50 py-1 text-popover-foreground animate-in fade-in-0 zoom-in-95">
            <div className="px-3 py-1.5 border-b border-border/40 flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-semibold text-foreground/80">选择知识库项目</span>
              {loading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
            </div>

            <div className="max-h-64 overflow-y-auto py-1 divide-y divide-border/20">
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
                  const isPlatformDefault = ws.project_id === '11111111-1111-4111-8111-111111111111'

                  return (
                    <div
                      key={key}
                      onClick={() => !isEditing && handleSelect(ws)}
                      className={cn(
                        'group w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors',
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
                        <div className="flex items-center gap-1 shrink-0 ml-1">
                          <button
                            type="button"
                            onClick={(e) => handleStartEdit(e, ws)}
                            className="p-1 rounded opacity-0 group-hover:opacity-80 hover:!opacity-100 hover:bg-muted text-muted-foreground hover:text-foreground transition-opacity cursor-pointer"
                            title="修改项目别名"
                          >
                            <Pencil className="size-3" />
                          </button>
                          {!isPlatformDefault && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setProjectToDelete(ws)
                                setDeleteDialogOpen(true)
                              }}
                              className="p-1 rounded opacity-0 group-hover:opacity-80 hover:!opacity-100 hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-opacity cursor-pointer"
                              title={isSelected ? "安全归档删除当前知识库" : "安全归档删除该知识库"}
                            >
                              <Trash2 className="size-3" />
                            </button>
                          )}
                          {isSelected && (
                            <Check className="size-3.5 text-emerald-500 font-bold ml-1 shrink-0" />
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            {/* 底部：+ 新建知识库 与 ⚙️ 管理知识库 */}
            <div className="p-1.5 border-t border-border/50 bg-muted/20 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false)
                  setCreateDialogOpen(true)
                }}
                className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 rounded-md transition-colors cursor-pointer border border-dashed border-emerald-500/30 hover:border-emerald-500/60"
              >
                <Plus className="size-3.5" />
                <span>新建知识库</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false)
                  setManageDialogOpen(true)
                }}
                className="flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-md transition-colors cursor-pointer border border-border/50"
                title="打开知识库集中管理面板"
              >
                <Settings className="size-3.5" />
                <span>管理</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 新建知识库模态框 */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Folder className="size-4 text-emerald-500" />
              <span>新建知识库项目</span>
            </DialogTitle>
            <DialogDescription>
              创建独立的多租户物理工作区，自动隔离图谱与向量索引。
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateProject} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                知识库名称 (Project Name) *
              </label>
              <input
                type="text"
                placeholder="例如：智能体知识库"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="w-full px-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-emerald-500"
                autoFocus
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                业务描述说明 (可选)
              </label>
              <textarea
                placeholder="用于记录本知识库收录的数据源、服务业务目标等..."
                value={newProjectDesc}
                onChange={(e) => setNewProjectDesc(e.target.value)}
                rows={2}
                className="w-full px-3 py-1.5 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
              />
            </div>

            {/* 可折叠高级配置 */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span>{showAdvanced ? '▼ 收起高级设置' : '▶ 高级设置 (自定义标识符与租户)'}</span>
              </button>

              {showAdvanced && (
                <div className="mt-2 p-3 rounded-lg bg-muted/30 border border-border/50 space-y-3 animate-in fade-in-50">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-foreground">
                        自定义标识符 (Project ID)
                      </label>
                      <span className="text-[10px] text-muted-foreground font-mono">留空则自动生成唯一标识</span>
                    </div>
                    <input
                      type="text"
                      placeholder="留空自动生成，如 proj_7f3a8b2c"
                      value={newProjectId}
                      onChange={(e) => setNewProjectId(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs font-mono rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">
                      租户归属 (Tenant ID)
                    </label>
                    <input
                      type="text"
                      placeholder="default"
                      value={newProjectTenant}
                      onChange={(e) => setNewProjectTenant(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs font-mono rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setCreateDialogOpen(false)
                  setShowAdvanced(false)
                }}
                disabled={creating}
              >
                取消
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={creating || !newProjectName.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {creating ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin mr-1" />
                    <span>初始化中...</span>
                  </>
                ) : (
                  <span>立即创建项目</span>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 专门的知识库集中管理面板 */}
      <Dialog open={manageDialogOpen} onOpenChange={setManageDialogOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Folder className="size-4 text-emerald-500" />
              <span>知识库管理中心 (Knowledge Bases)</span>
            </DialogTitle>
            <DialogDescription>
              集中查看所有物理工作区，支持项目切换、重命名及安全归档删除。
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[380px] overflow-y-auto divide-y divide-border/40 py-2">
            {workspaces.map((ws) => {
              const isSelected = ws.is_current
              const isPlatformDefault = ws.project_id === '11111111-1111-4111-8111-111111111111'
              const titleName = ws.name || getProjectDisplayName(ws)

              return (
                <div key={`${ws.tenant_id}:${ws.project_id}`} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-foreground truncate">{titleName}</span>
                      {isSelected && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium">
                          当前使用中
                        </span>
                      )}
                      {isPlatformDefault && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 font-medium">
                          系统默认
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono mt-0.5">
                      <span>ID: {ws.project_id.length > 20 ? `${ws.project_id.slice(0, 8)}...${ws.project_id.slice(-6)}` : ws.project_id}</span>
                      <span>· 版本: {ws.active_version}</span>
                      {ws.description && <span className="truncate max-w-[160px]">· {ws.description}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isSelected && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          handleSelect(ws)
                          setManageDialogOpen(false)
                        }}
                        className="h-7 text-xs px-2.5"
                      >
                        切换至此
                      </Button>
                    )}
                    {!isPlatformDefault ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setProjectToDelete(ws)
                          setDeleteDialogOpen(true)
                        }}
                        className="h-7 text-xs px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        title="归档删除此知识库"
                      >
                        <Trash2 className="size-3.5 mr-1" />
                        <span>删除</span>
                      </Button>
                    ) : (
                      <span className="text-[11px] text-muted-foreground/60 px-2">系统保护</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <DialogFooter className="pt-2 flex justify-between sm:justify-between items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setManageDialogOpen(false)
                setCreateDialogOpen(true)
              }}
              className="text-xs text-emerald-600 dark:text-emerald-400 border-dashed border-emerald-500/40"
            >
              <Plus className="size-3.5 mr-1" />
              <span>新建知识库</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setManageDialogOpen(false)}
              className="text-xs"
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 归档删除确认模态框 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4 text-destructive" />
              <span>安全归档与删除确认</span>
            </DialogTitle>
            <DialogDescription>
              该操作将检查在途读租约，排空后将物理索引冷归档至回收站。
            </DialogDescription>
          </DialogHeader>

          {projectToDelete && (
            <div className="space-y-3 py-2 text-xs">
              {projectToDelete.is_current && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-2">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">注意：该项目为您当前正在使用的知识库！</span>
                    <p className="mt-0.5 text-muted-foreground">
                      确认删除后，系统会自动排空在途读租约并安全切回【平台默认项目】。
                    </p>
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1.5">
                <div className="font-semibold text-foreground flex items-center justify-between">
                  <span>目标项目：</span>
                  <span className="font-mono text-destructive">{projectToDelete.project_id}</span>
                </div>
                <div className="text-muted-foreground">
                  名称：<span className="text-foreground">{getProjectDisplayName(projectToDelete)}</span>
                </div>
                <div className="text-muted-foreground">
                  租户：<span className="font-mono text-foreground">{projectToDelete.tenant_id}</span>
                </div>
              </div>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                提示：为保障企业数据资产安全，系统不会直接硬删除，而是原子转移至 <code className="font-mono bg-muted px-1 py-0.5 rounded">sandbox_storage/.trash/</code> 目录，可由运维管理员按需恢复。
              </p>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDeleteDialogOpen(false)
                setProjectToDelete(null)
              }}
              disabled={deleting}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDeleteProject}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1" />
                  <span>排空中并归档...</span>
                </>
              ) : (
                <span>确认归档删除</span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
