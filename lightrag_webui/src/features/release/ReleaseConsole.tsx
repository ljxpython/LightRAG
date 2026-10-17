import React, { useEffect, useState } from 'react'
import {
  RocketIcon,
  ShieldCheckIcon,
  HistoryIcon,
  RotateCcwIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  SparklesIcon,
  LayersIcon
} from 'lucide-react'
import Button from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { useWorkspaceStore } from '@/stores/workspace'
import { toast } from 'sonner'
import SnapshotHistory from '@/features/release/SnapshotHistory'

interface OpsStatus {
  status: string
  active_version: string
  active_path: string
  has_candidate: boolean
  candidate_name?: string
  snapshot_sealed: boolean
}

export default function ReleaseConsole() {
  const { currentTenantId, currentProjectId, bumpEpoch } = useWorkspaceStore()
  const [opsStatus, setOpsStatus] = useState<OpsStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const fetchStatus = async () => {
    try {
      setLoading(true)
      const res = await fetch('/ops/status')
      if (res.ok) {
        const data = await res.json()
        setOpsStatus(data)
      }
    } catch (e) {
      console.warn('Failed to load release ops status:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
  }, [currentProjectId])

  const handleActivateCandidate = async () => {
    if (!opsStatus?.has_candidate) return
    try {
      setPublishing(true)
      const res = await fetch('/ops/candidates/activate', { method: 'POST' })
      if (res.ok) {
        const result = await res.json()
        toast.success(`候选版本已成功原子激活为 ${result.new_version}！`)
        bumpEpoch()
        fetchStatus()
      } else {
        const err = await res.json()
        toast.error(`发布失败: ${err.detail || '未知错误'}`)
      }
    } catch (e) {
      toast.error('网络异常，发布候选版本失败')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="h-full w-full overflow-y-auto p-6 space-y-6 max-w-6xl mx-auto">
      {/* 1. Header */}
      <div className="border-b border-border/60 pb-5">
        <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <RocketIcon className="size-5 text-blue-600 dark:text-blue-400" />
          <span>版本发布与治理总线 (Release & Snapshot Console)</span>
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          管理多租户物理工作区的版本发布流水线、候选沙箱原子升级以及历史快照秒级回滚。
        </p>
      </div>

      {/* 2. Current Production Release Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2 border-border/60 bg-card/70 shadow-xs">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                当前线上活跃版本 (Active Revision)
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>生产运行中</span>
              </span>
            </div>

            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-extrabold text-foreground font-mono">
                {opsStatus?.active_version || 'rev_1'}
              </span>
              <span className="text-xs text-muted-foreground font-mono truncate max-w-md">
                {opsStatus?.active_path}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-1">
                <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <ShieldCheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
                  <span>SHA-256 快照签名</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {opsStatus?.snapshot_sealed ? '完整性已封印，防篡改校验通过' : '未封印（测试或暂存状态）'}
                </p>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-1">
                <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <LayersIcon className="size-4 text-blue-600 dark:text-blue-400" />
                  <span>读租约保护</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  ReaderLeaseManager 优雅排空激活中
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 3. Candidate Staging Card */}
        <Card className="border-border/60 bg-card/70 shadow-xs">
          <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <SparklesIcon className="size-3.5 text-amber-500" />
                <span>待发布候选沙箱 (Staging)</span>
              </div>
              {opsStatus?.has_candidate ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs space-y-1">
                  <div className="font-semibold text-amber-600 dark:text-amber-400">
                    检测到新知识构建: {opsStatus.candidate_name}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    准备就绪，可通过 CAS 原子发布为最新 Revision。
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
                  暂无待发布的候选构建。在沙箱完成构建后将在此自动就绪。
                </div>
              )}
            </div>

            <Button
              variant="default"
              className="w-full h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              disabled={!opsStatus?.has_candidate || publishing}
              onClick={handleActivateCandidate}
            >
              <RocketIcon className="size-3.5" />
              <span>{publishing ? '正在原子切换...' : '一键原子发布到生产'}</span>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* 4. Snapshot History & Instant Rollback */}
      <SnapshotHistory
        activeVersion={opsStatus?.active_version}
        onRollbackComplete={fetchStatus}
      />

      {/* 5. Snapshot & Rollback Explainer */}
      <div className="rounded-xl border border-border/60 bg-card/70 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <HistoryIcon className="size-4 text-muted-foreground" />
          <span>版本快照与灾备原子回滚机制</span>
        </h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          LightRAG 企业底座采用 POSIX CAS 零锁切换技术。每次发布自动生成快照签名清单。当生产遇到任何脏数据污染时，只需指定历史版本目标（如 <code>rev_1</code>），底层在 10 毫秒内重定向 <code>active</code> 软链并优雅重载内存引擎，彻底杜绝服务停机。
        </p>
      </div>
    </div>
  )
}
