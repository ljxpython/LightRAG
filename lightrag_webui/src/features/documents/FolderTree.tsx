import { useState, useMemo } from 'react'
import {
  Folder,
  FolderPlus,
  Files,
  Tag,
  CheckCircle2,
  Clock,
  AlertCircle,
  MoreVertical,
  Trash2,
  Edit2,
  ChevronRight,
  FolderOpen
} from 'lucide-react'
import { useFolderStore, KnowledgeFolder } from '@/stores/folderStore'
import { cn } from '@/lib/utils'
import Button from '@/components/ui/Button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/Dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/DropdownMenu'
import { toast } from 'sonner'

interface FolderTreeProps {
  totalCount: number
  statusCounts: {
    completed: number
    processing: number
    failed: number
  }
  selectedStatus: string
  onSelectStatus: (status: string) => void
  className?: string
}

export default function FolderTree({
  totalCount,
  statusCounts,
  selectedStatus,
  onSelectStatus,
  className
}: FolderTreeProps) {
  const {
    folders,
    activeFolderId,
    docFolderMap,
    setActiveFolder,
    createFolder,
    updateFolder,
    deleteFolder
  } = useFolderStore()

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editingFolder, setEditingFolder] = useState<KnowledgeFolder | null>(null)
  const [folderName, setFolderName] = useState('')
  const [folderDesc, setFolderDesc] = useState('')
  const [folderColor, setFolderColor] = useState('emerald')
  const [searchQuery, setSearchQuery] = useState('')

  // 过滤文件夹
  const filteredFolders = useMemo(() => {
    if (!searchQuery.trim()) return folders
    const q = searchQuery.toLowerCase()
    return folders.filter((f) => f.name.toLowerCase().includes(q))
  }, [folders, searchQuery])

  // 计算每个文件夹下的文档数量
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const f of folders) {
      counts[f.id] = 0
    }
    for (const fId of Object.values(docFolderMap)) {
      if (counts[fId] !== undefined) {
        counts[fId]++
      }
    }
    return counts
  }, [folders, docFolderMap])

  const handleOpenCreate = () => {
    setFolderName('')
    setFolderDesc('')
    setFolderColor('emerald')
    setEditingFolder(null)
    setCreateDialogOpen(true)
  }

  const handleOpenEdit = (folder: KnowledgeFolder, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingFolder(folder)
    setFolderName(folder.name)
    setFolderDesc(folder.description || '')
    setFolderColor(folder.color || 'emerald')
    setCreateDialogOpen(true)
  }

  const handleDelete = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    deleteFolder(folderId)
    toast.success('文件夹已删除')
  }

  const handleSave = () => {
    if (!folderName.trim()) {
      toast.error('请输入文件夹名称')
      return
    }

    if (editingFolder) {
      updateFolder(editingFolder.id, folderName, folderDesc)
      toast.success('文件夹信息已更新')
    } else {
      createFolder(folderName, folderDesc, folderColor)
      toast.success('新文件夹已创建')
    }
    setCreateDialogOpen(false)
  }

  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    indigo: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
  }

  return (
    <div className={cn('flex flex-col h-full bg-card/60 border-r border-border/50 text-foreground', className)}>
      {/* 顶部标题与新建按钮 - 对齐 Style B */}
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm tracking-tight text-foreground">Folders</span>
          <span className="text-[11px] font-mono px-1.5 py-0.2 rounded-full bg-primary/10 text-primary">
            {folders.length}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleOpenCreate}
          className="size-7 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg"
          tooltip="新建文件夹"
          side="right"
        >
          <FolderPlus className="size-4" />
        </Button>
      </div>

      {/* 搜索框 - 对齐 Style B */}
      <div className="px-2.5 pt-2.5 pb-1">
        <div className="relative">
          <input
            type="text"
            placeholder="Search folders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-7 pr-2.5 py-1.5 text-xs rounded-lg border border-border/70 bg-background/60 placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1.5 focus:ring-primary/40 focus:border-primary/80 transition-all"
          />
          <span className="absolute left-2.5 top-2 text-muted-foreground pointer-events-none">🔍</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-4 text-xs">
        {/* 全部文档导航项 */}
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => setActiveFolder(null)}
            className={cn(
              'w-full flex items-center justify-between px-2.5 py-2 rounded-lg font-medium text-left transition-all group',
              activeFolderId === null
                ? 'bg-primary/10 text-primary font-semibold shadow-2xs'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Files className={cn('size-4 shrink-0', activeFolderId === null ? 'text-primary' : 'text-muted-foreground')} />
              <span className="truncate">全部文档 (All)</span>
            </div>
            <span className={cn(
              'px-2 py-0.5 text-[11px] rounded-full font-mono font-medium',
              activeFolderId === null ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
            )}>
              {totalCount}
            </span>
          </button>
        </div>

        {/* 业务文件夹列表 */}
        <div className="space-y-1">
          <div className="px-2 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
            业务目录 (Folders)
          </div>
          <div className="space-y-0.5">
            {filteredFolders.map((folder) => {
              const isSelected = activeFolderId === folder.id
              const count = folderCounts[folder.id] || 0
              const colorCls = colorMap[folder.color || 'emerald'] || colorMap.emerald

              return (
                <div
                  key={folder.id}
                  onClick={() => setActiveFolder(folder.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setActiveFolder(folder.id)
                    }
                  }}
                  className={cn(
                    'group relative flex items-center justify-between px-2.5 py-2 rounded-md font-medium cursor-pointer transition-all',
                    isSelected
                      ? 'bg-primary/10 text-primary font-semibold shadow-2xs'
                      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 pr-1">
                    {isSelected ? (
                      <FolderOpen className="size-4 shrink-0 text-primary" />
                    ) : (
                      <Folder className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
                    )}
                    <span className="truncate" title={folder.name}>
                      {folder.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      className={cn(
                        'px-1.5 py-0.5 text-[10px] rounded-full font-mono transition-opacity',
                        isSelected ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground',
                        count === 0 && 'opacity-60'
                      )}
                    >
                      {count}
                    </span>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-background/80 rounded transition-opacity"
                        >
                          <MoreVertical className="size-3 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-32 text-xs">
                        <DropdownMenuItem onClick={(e) => handleOpenEdit(folder, e)}>
                          <Edit2 className="size-3 mr-2" />
                          <span>重命名</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => handleDelete(folder.id, e)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="size-3 mr-2" />
                          <span>删除</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 快捷状态过滤器 */}
        <div className="space-y-1 pt-2 border-t border-border/40">
          <div className="px-2 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
            状态快筛 (Status)
          </div>
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => onSelectStatus('all')}
              className={cn(
                'w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left transition-all',
                selectedStatus === 'all'
                  ? 'bg-accent text-accent-foreground font-semibold'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
            >
              <div className="flex items-center gap-2">
                <Tag className="size-3.5 text-muted-foreground" />
                <span>全部状态</span>
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">{totalCount}</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectStatus('completed')}
              className={cn(
                'w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left transition-all',
                selectedStatus === 'completed'
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5 text-emerald-500" />
                <span>已就绪 (Ready)</span>
              </div>
              <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                {statusCounts.completed}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onSelectStatus('process')}
              className={cn(
                'w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left transition-all',
                selectedStatus === 'process'
                  ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
            >
              <div className="flex items-center gap-2">
                <Clock className="size-3.5 text-blue-500" />
                <span>索引中 (Processing)</span>
              </div>
              <span className="font-mono text-[10px] text-blue-600 dark:text-blue-400">
                {statusCounts.processing}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onSelectStatus('failed')}
              className={cn(
                'w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left transition-all',
                selectedStatus === 'failed'
                  ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 font-semibold'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="size-3.5 text-rose-500" />
                <span>异常报错 (Failed)</span>
              </div>
              <span className="font-mono text-[10px] text-rose-600 dark:text-rose-400">
                {statusCounts.failed}
              </span>
            </button>
          </div>
        </div>

        {/* Style B: 底部品牌引导卡片 */}
        <div className="pt-2">
          <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-50/80 via-blue-50/50 to-sky-50/80 dark:from-indigo-950/30 dark:via-blue-950/20 dark:to-slate-900/40 border border-blue-100/60 dark:border-blue-900/40 shadow-xs">
            <div className="flex items-center gap-1.5 font-semibold text-[11px] text-foreground">
              <span className="text-primary text-xs">✦</span>
              <span>Build Smarter with Knowledge</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
              Structured data. Deeper insights. Better decisions.
            </p>
          </div>
        </div>
      </div>

      {/* 新建/编辑对话框 */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{editingFolder ? '修改知识文件夹' : '新建知识文件夹'}</DialogTitle>
            <DialogDescription>
              按业务模块或数据源划分文档，便于批量检索与版本管控。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div className="space-y-1.5">
              <label htmlFor="folder-name-input" className="text-xs font-semibold text-foreground">
                文件夹名称 *
              </label>
              <input
                id="folder-name-input"
                type="text"
                placeholder="例如：Operations Spec / 核心接口协议"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                className="w-full px-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="folder-desc-input" className="text-xs font-semibold text-foreground">
                描述说明
              </label>
              <input
                id="folder-desc-input"
                type="text"
                placeholder="简述该目录收录的文档范围"
                value={folderDesc}
                onChange={(e) => setFolderDesc(e.target.value)}
                className="w-full px-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">主题颜色</label>
              <div className="flex items-center gap-2 pt-1">
                {['emerald', 'blue', 'indigo', 'amber', 'purple'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFolderColor(c)}
                    className={cn(
                      'size-6 rounded-full border-2 transition-transform',
                      c === 'emerald' && 'bg-emerald-500',
                      c === 'blue' && 'bg-blue-500',
                      c === 'indigo' && 'bg-indigo-500',
                      c === 'amber' && 'bg-amber-500',
                      c === 'purple' && 'bg-purple-500',
                      folderColor === c ? 'scale-115 border-foreground shadow-sm' : 'border-transparent opacity-80 hover:opacity-100'
                    )}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateDialogOpen(false)}>
              取消
            </Button>
            <Button size="sm" onClick={handleSave}>
              {editingFolder ? '保存修改' : '立即创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
