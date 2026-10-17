import React, { useEffect, useState } from 'react'
import {
  History,
  ShieldCheck,
  ShieldAlert,
  RotateCcw,
  CheckCircle2,
  Clock,
  ChevronRight,
  AlertTriangle
} from 'lucide-react'
import Button from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { useWorkspaceStore } from '@/stores/workspace'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/Dialog'

interface SnapshotRecord {
  revision: string
  is_sealed: boolean
  is_valid: boolean
  integrity_errors: string[]
}

interface SnapshotHistoryProps {
  activeVersion?: string
  onRollbackComplete?: () => void
}

export default function SnapshotHistory({
  activeVersion = 'rev_1',
  onRollbackComplete
}: SnapshotHistoryProps) {
  const { currentTenantId, currentProjectId, bumpEpoch } = useWorkspaceStore()
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [confirmDialogRev, setConfirmDialogRev] = useState<string | null>(null)
  const [rollingBack, setRollingBack] = useState(false)

  const fetchSnapshots = async () => {
    try {
      setLoading(true)
      const res = await fetch('/ops/snapshots')
      if (res.ok) {
        const data = await res.json()
        setSnapshots(data.snapshots || [])
      }
    } catch (e) {
      console.warn('Failed to load snapshots history:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSnapshots()
  }, [currentProjectId, activeVersion])

  const handleRollback = async () => {
    if (!confirmDialogRev) return
    try {
      setRollingBack(true)
      const res = await fetch('/ops/snapshots/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: currentTenantId,
          project_id: currentProjectId,
          target_revision: confirmDialogRev
        })
      })

      if (res.ok) {
        toast.success(`已原子回滚至历史版本 ${confirmDialogRev}！`)
        bumpEpoch()
        setConfirmDialogRev(null)
        if (onRollbackComplete) onRollbackComplete()
        fetchSnapshots()
      } else {
        const err = await res.json()
        toast.error(`回滚失败: ${err.detail || '未知原因'}`)
      }
    } catch (e) {
      toast.error('网络请求异常，回滚失败')
    } finally {
      setRollingBack(false)
    }
  }

  return (
    <Card className="border-border/60 bg-card/70 shadow-xs">
      <CardHeader className="py-4 px-6 border-b border-border/40 flex flex-row items-center justify-between">
        <div className="space-y-0.5">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <History className="size-4 text-primary" />
            <span>历史版本时间轴与 SHA-256 完整性封印</span>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            每个正式发布的版本均包含 SHA-256 文件指纹。可一键原子回滚至任意安全快照。
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchSnapshots}
          disabled={loading}
          className="h-7 text-xs"
        >
          刷新快照
        </Button>
      </CardHeader>
      <CardContent className="p-6">
        {snapshots.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground">
            暂无历史快照版本记录
          </div>
        ) : (
          <div className="space-y-3">
            {snapshots.map((snap) => {
              const isActive = snap.revision === activeVersion
              return (
                <div
                  key={snap.revision}
                  className={cn(
                    'flex items-center justify-between p-3.5 rounded-xl border transition-all',
                    isActive
                      ? 'border-primary/50 bg-primary/5 shadow-2xs'
                      : 'border-border/60 bg-background/50 hover:bg-muted/30'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'size-9 rounded-lg flex items-center justify-center font-mono font-bold text-xs',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {snap.revision.replace('rev_', 'R')}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs font-mono text-foreground">
                          {snap.revision}
                        </span>
                        {isActive && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                            当前激活 (Active)
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px]">
                        {snap.is_sealed ? (
                          snap.is_valid ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <ShieldCheck className="size-3.5" />
                              <span>完整性封印校验通过</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-rose-500">
                              <ShieldAlert className="size-3.5" />
                              <span>签名哈希不符 ({snap.integrity_errors.length} 项异常)</span>
                            </span>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Clock className="size-3.5" />
                            <span>未封印快照</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    {isActive ? (
                      <span className="text-xs text-muted-foreground font-medium px-3 py-1">
                        生产运行中
                      </span>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1.5 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 dark:hover:bg-rose-950/20"
                        onClick={() => setConfirmDialogRev(snap.revision)}
                      >
                        <RotateCcw className="size-3.5" />
                        <span>回滚至此版本</span>
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* 灾备回退二次确认 Dialog */}
        <Dialog open={confirmDialogRev !== null} onOpenChange={() => setConfirmDialogRev(null)}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-rose-600">
                <AlertTriangle className="size-5" />
                <span>确认原子回滚至 {confirmDialogRev}？</span>
              </DialogTitle>
              <DialogDescription className="text-xs pt-1">
                此操作将利用 POSIX CAS 零锁机制将生产 <code>active</code> 软链原子重定向至{' '}
                <code>revisions/{confirmDialogRev}</code>，并排空旧版本活跃在读查询。
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-700 dark:text-amber-300">
              提示：回滚将在 10 毫秒内原地生效，图谱索引与检索会话将无缝切换至该历史版本的快照基准。
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDialogRev(null)}
                disabled={rollingBack}
              >
                取消
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRollback}
                disabled={rollingBack}
                className="gap-1.5"
              >
                <RotateCcw className="size-3.5" />
                <span>{rollingBack ? '正在回滚...' : '立即确认回滚'}</span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
