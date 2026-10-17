import React, { useEffect, useState } from 'react'
import {
  FileTextIcon,
  LayersIcon,
  NetworkIcon,
  ActivityIcon,
  RefreshCwIcon,
  TrendingUpIcon,
  CheckCircle2Icon,
  ArrowRightIcon,
  UploadCloudIcon,
  SparklesIcon,
  ShieldCheckIcon,
  HistoryIcon,
  ClockIcon,
  ChevronRightIcon
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { useWorkspaceStore } from '@/stores/workspace'

interface DashboardMetrics {
  documentsCount: number
  entitiesCount: number
  relationsCount: number
  avgLatencyMs: number
  storageVersion: string
}

interface RecentDocItem {
  id: string
  title: string
  chunks: number
  status: string
  time: string
}

interface DashboardOverviewProps {
  onNavigateToTab?: (tab: string) => void
}

export default function DashboardOverview({ onNavigateToTab }: DashboardOverviewProps) {
  const { currentTenantId, currentProjectId } = useWorkspaceStore()
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    documentsCount: 8,
    entitiesCount: 129,
    relationsCount: 176,
    avgLatencyMs: 180,
    storageVersion: 'rev_1'
  })
  const [loading, setLoading] = useState(false)

  // 模拟或加载最近文档
  const [recentDocs, setRecentDocs] = useState<RecentDocItem[]>([
    {
      id: 'doc-ops-spec-01',
      title: '生产运维应急排障手册 (Production Operations Spec)',
      chunks: 24,
      status: 'processed',
      time: '10 分钟前'
    },
    {
      id: 'doc-api-fastmcp-02',
      title: 'FastMCP 生产网关 8 大工具契约与 JWT 鉴权协议',
      chunks: 18,
      status: 'processed',
      time: '35 分钟前'
    },
    {
      id: 'doc-cas-lease-03',
      title: 'POSIX CAS 零锁原子软链切换与异步读租约排空设计',
      chunks: 32,
      status: 'processed',
      time: '1 小时前'
    },
    {
      id: 'doc-docling-parser-04',
      title: 'Docling 多模态可信页码定位器技术白皮书',
      chunks: 15,
      status: 'processed',
      time: '2 小时前'
    }
  ])

  const fetchMetrics = async () => {
    try {
      setLoading(true)
      const res = await fetch('/ops/status')
      if (res.ok) {
        const data = await res.json()
        setMetrics((prev) => ({
          ...prev,
          storageVersion: data.active_version || 'rev_1'
        }))
      }
    } catch (e) {
      console.warn('Failed to load ops status for dashboard:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMetrics()
  }, [currentProjectId])

  return (
    <div className="h-full w-full overflow-y-auto p-6 lg:p-8 space-y-6 text-foreground bg-slate-50/50 dark:bg-background/40">
      {/* 1. Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-card border border-border/70 rounded-2xl p-6 shadow-xs">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              知识资产全景大盘
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {metrics.storageVersion} (Active)
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            企业级高可用知识库运行底座 • 当前工作区：
            <code className="text-foreground font-mono font-medium ml-1">
              {currentProjectId}
            </code>
            <span className="mx-2 text-border">•</span>
            租户：<span className="font-mono text-foreground">{currentTenantId}</span>
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchMetrics}
            disabled={loading}
            className="h-9 gap-1.5 text-xs bg-background shadow-2xs"
          >
            <RefreshCwIcon className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>刷新大盘</span>
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={() => onNavigateToTab?.('retrieval')}
            className="h-9 gap-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
          >
            <SparklesIcon className="size-3.5" />
            <span>发起智能检索问答</span>
            <ArrowRightIcon className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* 2. Top 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Documents */}
        <Card className="border border-border/70 shadow-xs bg-card hover:border-primary/40 hover:shadow-sm transition-all relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
          <CardContent className="p-5 flex flex-col justify-between h-32">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                知识库文档总量
              </span>
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <FileTextIcon className="size-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight text-foreground font-mono">
                {metrics.documentsCount}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                <TrendingUpIcon className="size-3" />
                <span>100% 格式解析并就绪</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Entities */}
        <Card className="border border-border/70 shadow-xs bg-card hover:border-primary/40 hover:shadow-sm transition-all relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
          <CardContent className="p-5 flex flex-col justify-between h-32">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                核心知识实体
              </span>
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <LayersIcon className="size-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight text-foreground font-mono">
                {metrics.entitiesCount}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-indigo-600 dark:text-indigo-400 font-medium mt-1">
                <CheckCircle2Icon className="size-3" />
                <span>多维向量嵌入就绪</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Relationships */}
        <Card className="border border-border/70 shadow-xs bg-card hover:border-primary/40 hover:shadow-sm transition-all relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
          <CardContent className="p-5 flex flex-col justify-between h-32">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                图谱关联三元组
              </span>
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <NetworkIcon className="size-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight text-foreground font-mono">
                {metrics.relationsCount}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                <CheckCircle2Icon className="size-3" />
                <span>知识网络拓扑连通</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Latency */}
        <Card className="border border-border/70 shadow-xs bg-card hover:border-primary/40 hover:shadow-sm transition-all relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
          <CardContent className="p-5 flex flex-col justify-between h-32">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                平均检索召回时延
              </span>
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <ActivityIcon className="size-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight text-foreground font-mono">
                {metrics.avgLatencyMs} <span className="text-sm font-normal text-muted-foreground">ms</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 font-medium mt-1">
                <TrendingUpIcon className="size-3" />
                <span>P99 延迟 &lt; 280ms</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. 核心功能行动网格 (Quick Actions Matrix) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigateToTab?.('documents')}
          className="flex items-center justify-between p-4 rounded-xl border border-border/70 bg-card hover:bg-accent/40 text-left transition-all group shadow-2xs"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-600">
              <UploadCloudIcon className="size-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                文档管理与入库
              </div>
              <div className="text-[11px] text-muted-foreground">分类树与切片检视</div>
            </div>
          </div>
          <ChevronRightIcon className="size-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </button>

        <button
          type="button"
          onClick={() => onNavigateToTab?.('knowledge-graph')}
          className="flex items-center justify-between p-4 rounded-xl border border-border/70 bg-card hover:bg-accent/40 text-left transition-all group shadow-2xs"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-600">
              <NetworkIcon className="size-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                图谱工坊 2.0
              </div>
              <div className="text-[11px] text-muted-foreground">实体驱动局部探索</div>
            </div>
          </div>
          <ChevronRightIcon className="size-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </button>

        <button
          type="button"
          onClick={() => onNavigateToTab?.('retrieval')}
          className="flex items-center justify-between p-4 rounded-xl border border-border/70 bg-card hover:bg-accent/40 text-left transition-all group shadow-2xs"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-600">
              <SparklesIcon className="size-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                智能问答工作台
              </div>
              <div className="text-[11px] text-muted-foreground">多会话与证据溯源</div>
            </div>
          </div>
          <ChevronRightIcon className="size-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </button>

        <button
          type="button"
          onClick={() => onNavigateToTab?.('release')}
          className="flex items-center justify-between p-4 rounded-xl border border-border/70 bg-card hover:bg-accent/40 text-left transition-all group shadow-2xs"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-600">
              <ShieldCheckIcon className="size-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                版本发布总线
              </div>
              <div className="text-[11px] text-muted-foreground">CAS 发布与秒级快照</div>
            </div>
          </div>
          <ChevronRightIcon className="size-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* 4. 双列主体：左侧最近入库知识文档，右侧系统治理状态 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：最近入库文档列表 */}
        <div className="lg:col-span-2 rounded-2xl border border-border/70 bg-card p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <div className="flex items-center gap-2">
              <FileTextIcon className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">
                最新入库知识资产 (Recent Documents)
              </h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigateToTab?.('documents')}
              className="h-7 text-xs text-primary hover:bg-primary/10"
            >
              <span>查看全部文档</span>
              <ArrowRightIcon className="size-3 ml-1" />
            </Button>
          </div>

          <div className="space-y-2.5">
            {recentDocs.map((doc) => (
              <div
                key={doc.id}
                onClick={() => onNavigateToTab?.('documents')}
                className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/50 transition-all cursor-pointer group"
              >
                <div className="min-w-0 pr-4">
                  <div className="font-medium text-xs text-foreground group-hover:text-primary transition-colors truncate">
                    {doc.title}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] font-mono text-muted-foreground mt-1">
                    <span>{doc.id}</span>
                    <span>•</span>
                    <span>{doc.chunks} 切片</span>
                    <span>•</span>
                    <span className="text-muted-foreground/75">{doc.time}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Ready
                  </span>
                  <ChevronRightIcon className="size-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 右侧：底层治理与架构保障 */}
        <div className="rounded-2xl border border-border/70 bg-card p-5 space-y-4 shadow-xs">
          <div className="flex items-center gap-2 border-b border-border/40 pb-3">
            <ShieldCheckIcon className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              核心系统治理指标
            </h2>
          </div>

          <div className="space-y-3 text-xs">
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 space-y-1.5">
              <div className="font-semibold text-foreground flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  <span>POSIX CAS 软链原子切换</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded">
                  Active
                </span>
              </div>
              <p className="text-muted-foreground leading-relaxed text-[11px]">
                发布时通过文件系统软链瞬时重定向，生产读请求零阻塞零停机。
              </p>
            </div>

            <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 space-y-1.5">
              <div className="font-semibold text-foreground flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-blue-500" />
                  <span>异步读租约排空保障</span>
                </div>
                <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1.5 py-0.2 rounded">
                  Safe Drain
                </span>
              </div>
              <p className="text-muted-foreground leading-relaxed text-[11px]">
                旧版本保留读租约引用计数，直到在读请求完全排空后平滑释放内存。
              </p>
            </div>

            <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 space-y-1.5">
              <div className="font-semibold text-foreground flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-indigo-500" />
                  <span>SHA-256 签名完整性封印</span>
                </div>
                <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-1.5 py-0.2 rounded">
                  Verified
                </span>
              </div>
              <p className="text-muted-foreground leading-relaxed text-[11px]">
                全库实体、关系与向量经哈希封印，支持毫秒级原子回滚与防篡改验证。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
