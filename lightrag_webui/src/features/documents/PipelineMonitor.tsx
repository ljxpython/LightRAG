import { useState, useEffect, useRef } from 'react'
import {
  Activity,
  CheckCircle2,
  StopCircle,
  Terminal,
  RefreshCw,
  Clock,
  Layers
} from 'lucide-react'
import Button from '@/components/ui/Button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/Dialog'
import { getPipelineStatus, cancelPipeline, PipelineStatusResponse } from '@/api/lightrag'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface PipelineMonitorProps {
  onRefreshDocs?: () => void
  className?: string
  compact?: boolean
}

export default function PipelineMonitor({
  onRefreshDocs,
  className
}: PipelineMonitorProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [status, setStatus] = useState<PipelineStatusResponse | null>(null)
  const [isPolling, setIsPolling] = useState(true)
  const [canceling, setCanceling] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null

    const fetchStatus = async () => {
      try {
        const data = await getPipelineStatus()
        setStatus(data)
      } catch (e) {
        // 静默处理轮询异常，避免高频打扰
      }
    }

    if (isPolling) {
      fetchStatus()
      // 如果弹窗打开或者有任务正在执行，每 2 秒高频刷新；平时 5 秒低频探测
      const interval = modalOpen || status?.busy ? 2000 : 5000
      timer = setInterval(fetchStatus, interval)
    }

    return () => {
      if (timer) clearInterval(timer)
    }
  }, [isPolling, modalOpen, status?.busy])

  useEffect(() => {
    if (modalOpen && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [status?.history_messages, modalOpen])

  const handleConfirmCancel = async () => {
    setShowCancelConfirm(false)
    setCanceling(true)
    try {
      const res = await cancelPipeline()
      if (res?.status === 'cancellation_requested') {
        toast.success('已发送中断流水线指令')
      } else {
        toast.info('流水线当前未在运行')
      }
      if (onRefreshDocs) onRefreshDocs()
    } catch (e) {
      toast.error('中断流水线失败')
    } finally {
      setCanceling(false)
    }
  }

  const isBusy = Boolean(status?.busy)

  // 从后端真实下发的 latest_message / history_messages / job_name 中精准推导当前阶段
  const latestMsg =
    status?.latest_message ||
    (status?.history_messages && status.history_messages.length > 0
      ? status.history_messages[status.history_messages.length - 1]
      : '') ||
    status?.job_name ||
    ''

  const resolveCurrentOp = (): string => {
    if (!isBusy) return '就绪待命'
    const lower = latestMsg.toLowerCase()
    if (lower.includes('parse') || lower.includes('reading') || lower.includes('scan')) {
      return '文档解析中 (Parsing)'
    }
    if (lower.includes('extract') || lower.includes('entity') || lower.includes('relation') || lower.includes('analyz')) {
      return '实体抽取中 (Extracting)'
    }
    if (lower.includes('embed') || lower.includes('vector') || lower.includes('llm')) {
      return '向量嵌入中 (Embedding)'
    }
    if (lower.includes('ready') || lower.includes('persist') || lower.includes('merge')) {
      return '图谱就绪中 (Ready)'
    }
    return latestMsg ? (latestMsg.length > 25 ? latestMsg.slice(0, 25) + '...' : latestMsg) : '流水线处理中'
  }

  const currentOp = resolveCurrentOp()
  const messages = status?.history_messages || []

  // 判断流水线各阶段的当前高亮
  const getStepStatus = (step: 'parse' | 'extract' | 'embed' | 'ready') => {
    if (!isBusy) {
      return step === 'ready' ? 'completed' : 'idle'
    }
    const op = latestMsg.toLowerCase()
    if (op.includes('parse') || op.includes('reading') || op.includes('scan')) {
      if (step === 'parse') return 'active'
      return 'pending'
    }
    if (op.includes('extract') || op.includes('entity') || op.includes('relation') || op.includes('analyz')) {
      if (step === 'parse') return 'completed'
      if (step === 'extract') return 'active'
      return 'pending'
    }
    if (op.includes('embed') || op.includes('vector') || op.includes('llm')) {
      if (step === 'parse' || step === 'extract') return 'completed'
      if (step === 'embed') return 'active'
      return 'pending'
    }
    return 'active'
  }

  const steps = [
    { key: 'parse', label: '1. Parsing', desc: '文档解析与切分' },
    { key: 'extract', label: '2. Extracting', desc: '实体与关系抽取' },
    { key: 'embed', label: '3. Embedding', desc: '多维向量嵌入' },
    { key: 'ready', label: '4. Ready', desc: '持久化与图谱就绪' }
  ] as const

  const totalBatches = status?.batchs || 0
  const curBatch = status?.cur_batch || 0
  const progressPercent = totalBatches > 0 ? Math.min(100, Math.round((curBatch / totalBatches) * 100)) : 0

  return (
    <>
      {/* 顶栏极简触发按钮 (与 Scan / Upload 等高同规格对齐) */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setModalOpen(true)}
        className={cn(
          'gap-2 text-xs h-9 rounded-xl border-border/70 transition-all font-medium',
          isBusy
            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/35 hover:bg-amber-500/20'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
          className
        )}
        tooltip="点击查看流水线执行进度与实时日志"
      >
        {isBusy ? (
          <>
            <span className="relative flex size-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full size-2 bg-amber-500" />
            </span>
            <span className="truncate max-w-[150px]">流水线处理中 ({currentOp})</span>
          </>
        ) : (
          <>
            <Activity className="size-3.5 text-muted-foreground" />
            <span>流水线状态</span>
          </>
        )}
      </Button>

      {/* 现代升级版居中弹出模态卡片 */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[760px] p-0 overflow-hidden rounded-2xl border-border/80 bg-card shadow-2xl">
          {/* Header 区域 */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-muted/20">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'size-9 rounded-xl flex items-center justify-center border',
                  isBusy
                    ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                    : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                )}
              >
                <Activity className={cn('size-4.5', isBusy && 'animate-pulse')} />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                  流水线监控中心
                  <span
                    className={cn(
                      'text-xs px-2 py-0.5 rounded-full font-mono font-medium border',
                      isBusy
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                        : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                    )}
                  >
                    {isBusy ? currentOp : '就绪待命'}
                  </span>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  实时监控文档解析、实体与关系抽取、多维向量嵌入与知识图谱构建状态
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* Body 区域 */}
          <div className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto">
            {/* 1. 四阶段流水线卡片 */}
            <div className="grid grid-cols-4 gap-2.5">
              {steps.map((st) => {
                const state = getStepStatus(st.key)
                return (
                  <div
                    key={st.key}
                    className={cn(
                      'p-3 rounded-xl border text-xs transition-all relative overflow-hidden flex flex-col justify-between min-h-[76px]',
                      state === 'active' &&
                        'bg-primary/10 border-primary/50 shadow-xs ring-1 ring-primary/20',
                      state === 'completed' &&
                        'bg-emerald-500/5 border-emerald-500/30 text-emerald-700 dark:text-emerald-400',
                      state === 'pending' && 'bg-muted/20 border-border/40 opacity-60',
                      state === 'idle' && 'bg-muted/15 border-border/40 opacity-70'
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={cn(
                          'font-semibold text-xs',
                          state === 'active' ? 'text-primary' : 'text-foreground'
                        )}
                      >
                        {st.label}
                      </span>
                      {state === 'completed' && (
                        <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                      )}
                      {state === 'active' && (
                        <span className="relative flex size-2 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                          <span className="relative inline-flex rounded-full size-2 bg-primary" />
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-tight">{st.desc}</p>
                  </div>
                )
              })}
            </div>

            {/* 2. 任务批次进度信息 (当有活动任务或统计时显示) */}
            {(isBusy || totalBatches > 0) && (
              <div className="p-3.5 rounded-xl border border-border/60 bg-muted/25 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                    <Layers className="size-3.5 text-primary" />
                    任务批次进度:
                    <span className="text-foreground font-mono font-semibold">
                      {curBatch} / {totalBatches || 1}
                    </span>
                  </span>
                  <span className="font-mono text-primary font-semibold text-xs">
                    {progressPercent}%
                  </span>
                </div>
                {/* 进度条 */}
                <div className="w-full h-1.5 bg-muted/60 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300 rounded-full"
                    style={{ width: `${Math.max(5, progressPercent)}%` }}
                  />
                </div>
              </div>
            )}

            {/* 3. 实时终端控制台日志面板 */}
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-medium pb-1.5 border-b border-border/40">
                <div className="flex items-center gap-1.5">
                  <Terminal className="size-3.5 text-primary" />
                  <span className="text-foreground font-semibold">
                    实时流水线事件流 (Pipeline Execution Stream)
                  </span>
                </div>
                <span className="text-[11px] font-mono bg-muted/60 px-2 py-0.5 rounded-md">
                  {messages.length} 条流水线事件
                </span>
              </div>
              <div className="bg-zinc-950 text-zinc-200 border border-zinc-800/80 rounded-lg p-3 font-mono text-[11px] max-h-48 overflow-y-auto space-y-1 select-text shadow-inner">
                {messages.length === 0 ? (
                  <div className="text-zinc-500 italic py-4 text-center">
                    暂无流水线历史事件
                  </div>
                ) : (
                  messages.map((msg, i) => (
                    <div
                      key={i}
                      className="leading-relaxed hover:bg-zinc-900/60 rounded px-1 -mx-1"
                    >
                      <span className="text-zinc-500 mr-2 select-none">
                        [{String(i + 1).padStart(2, '0')}]
                      </span>
                      <span>{msg}</span>
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>

          {/* Footer 操作栏 */}
          <div className="px-6 py-3.5 border-t border-border/50 bg-muted/15 flex items-center justify-between">
            <div>
              {isBusy ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCancelConfirm(true)}
                  disabled={canceling}
                  className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  <StopCircle className="size-3.5 mr-1.5" />
                  <span>中断流水线</span>
                </Button>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                  <span>流水线就绪，可随时执行文档扫描或增量上传</span>
                </div>
              )}
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setModalOpen(false)}
              className="h-8 text-xs rounded-lg px-4"
            >
              关闭
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 中断确认弹窗 */}
      <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-destructive flex items-center gap-2">
              <StopCircle className="size-5" />
              确认中断当前流水线？
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-2">
              中断流水线将立即终止当前正在执行的切片、实体提取或多模态向量化任务，部分未完成的索引可能需要重新扫描构建。
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2.5 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCancelConfirm(false)}
              className="h-8 text-xs"
            >
              取消
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmCancel}
              className="h-8 text-xs"
            >
              确认中断
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
