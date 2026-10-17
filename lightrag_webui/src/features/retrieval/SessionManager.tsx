import { useState } from 'react'
import {
  MessageSquare,
  Plus,
  Trash2,
  Edit2,
  MoreVertical,
  Clock,
  ChevronLeft,
  ChevronRight,
  MessageSquarePlus,
  Layers
} from 'lucide-react'
import { useChatSessionStore, ChatSession } from '@/stores/chatSessionStore'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/DropdownMenu'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/Dialog'
import { toast } from 'sonner'

interface SessionManagerProps {
  onNewSession?: () => void
  className?: string
}

export default function SessionManager({ onNewSession, className }: SessionManagerProps) {
  const {
    sessions,
    activeSessionId,
    createSession,
    switchSession,
    updateSessionTitle,
    deleteSession
  } = useChatSessionStore()

  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [editingSession, setEditingSession] = useState<ChatSession | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [collapsed, setCollapsed] = useState(false)

  const handleCreate = () => {
    createSession('新对话', 'hybrid')
    if (onNewSession) onNewSession()
    toast.success('已创建新对话')
  }

  const handleOpenRename = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingSession(session)
    setNewTitle(session.title)
    setRenameDialogOpen(true)
  }

  const handleSaveRename = () => {
    if (!newTitle.trim()) {
      toast.error('会话标题不能为空')
      return
    }
    if (editingSession) {
      updateSessionTitle(editingSession.id, newTitle)
      toast.success('会话已重命名')
    }
    setRenameDialogOpen(false)
  }

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    deleteSession(id)
    toast.success('会话已删除')
  }

  if (collapsed) {
    return (
      <div className="flex flex-col items-center py-3 px-1 border-r border-border/60 bg-card/40 shrink-0 w-12 h-full">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(false)}
          className="size-8 text-muted-foreground hover:text-foreground mb-3"
          tooltip="展开会话列表"
        >
          <ChevronRight className="size-4" />
        </Button>

        <Button
          variant="outline"
          size="icon"
          onClick={handleCreate}
          className="size-8 text-primary border-primary/30 hover:bg-primary/10 shadow-2xs"
          tooltip="新建对话"
        >
          <Plus className="size-4" />
        </Button>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-col h-full border-r border-border/60 bg-card/50 w-60 shrink-0 text-foreground transition-all select-none',
        className
      )}
    >
      {/* 顶部标题与折叠 */}
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-primary" />
          <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            会话历史
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(true)}
            className="size-6 text-muted-foreground hover:text-foreground"
            tooltip="收起会话列表"
          >
            <ChevronLeft className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* 新建会话按钮 */}
      <div className="p-2.5">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCreate}
          className="w-full justify-center gap-2 h-9 text-xs font-medium border-border/80 bg-background/80 hover:bg-accent hover:border-primary/40 text-foreground shadow-2xs"
        >
          <Plus className="size-3.5 text-primary" />
          <span>新建对话 (New Chat)</span>
        </Button>
      </div>

      {/* 会话列表 */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1 text-xs">
        <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground/70 uppercase">
          最近对话 ({sessions.length})
        </div>

        {sessions.map((session) => {
          const isActive = activeSessionId === session.id

          return (
            <div
              key={session.id}
              onClick={() => switchSession(session.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  switchSession(session.id)
                }
              }}
              className={cn(
                'group relative flex items-center justify-between px-2.5 py-2 rounded-lg font-medium cursor-pointer transition-all',
                isActive
                  ? 'bg-primary/10 text-primary font-semibold shadow-2xs'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
              )}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1 pr-1">
                <MessageSquare
                  className={cn(
                    'size-3.5 shrink-0',
                    isActive ? 'text-primary' : 'text-muted-foreground/70'
                  )}
                />
                <span className="truncate text-xs" title={session.title}>
                  {session.title}
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
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
                  <DropdownMenuContent align="end" className="w-28 text-xs">
                    <DropdownMenuItem onClick={(e) => handleOpenRename(session, e)}>
                      <Edit2 className="size-3 mr-2" />
                      <span>重命名</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => handleDelete(session.id, e)}
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

      {/* 重命名 Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>重命名会话</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full px-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRenameDialogOpen(false)}>
              取消
            </Button>
            <Button size="sm" onClick={handleSaveRename}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
