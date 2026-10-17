import { useState, useEffect, useRef } from 'react'
import {
  Activity,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Play,
  RotateCcw,
  StopCircle,
  Terminal,
  ChevronDown,
  ChevronUp,
  Layers,
  Cpu,
  Check,
  X
} from 'lucide-react'
import Button from '@/components/ui/Button'
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
  className,
  compact = false
}: PipelineMonitorProps) {
  const [status, setStatus] = useState<PipelineStatusResponse | null>(null)
  const [isPolling, setIsPolling] = useState(true)
  const [canceling, setCanceling] = useState(false)
  const [expanded, setExpanded] = useState(!compact)
  const [showLogs, setShowLogs] = useState(false)
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
      timer = setInterval(fetchStatus, 3000)
    }

    return () => {
      if (timer) clearInterval(timer)
    }
  }, [isPolling])

  useEffect(() => {
    if (showLogs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [status?.history_messages, showLogs])

  const handleCancel = async () => {
    setCanceling(true)
    try {
      await cancelPipeline()
      toast.success('已发送取消流水线指令')
      if (onRefreshDocs) onRefreshDocs()
    } catch (e) {
      toast.error('取消流水线失败')
    } finally {
      setCanceling(false)
    }
  }

  const isBusy = Boolean(status?.busy)
  const currentOp = status?.current_op || '空闲就绪 (Idle)'
  const messages = status?.history_messages || []

  // 判断流水线各阶段的当前高亮
  const getStepStatus = (step: 'parse' | 'extract' | 'embed' | 'ready') => {
    if (!isBusy) {
      return step === 'ready' ? 'completed' : 'idle'
    }
    const op = currentOp.toLowerCase()
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

  return (
    <div
      className={cn(
        'rounded-xl border border-border/80 bg-card/70 backdrop-blur shadow-2xs overflow-hidden transition-all',
        className
      )}
    >
      {/* 状态总览条 Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border/40">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={cn(
              'size-2 rounded-full shrink-0 animate-pulse',
              isBusy ? 'bg-amber-500' : 'bg-emerald-500'
            )}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">
              {isBusy ? '任务流水线执行中' : '流水线监控中心'}
            </span>
            <span
              className={cn(
                'px-2 py-0.5 text-[10px] font-mono rounded-full font-medium',
                isBusy
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                  : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
              )}
            >
              {isBusy ? currentOp : '就绪待命'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isBusy && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={canceling}
              className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              <StopCircle className="size-3.5 mr-1" />
              <span>中断流水线</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowLogs(!showLogs)}
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
          >
            <Terminal className="size-3 mr-1" />
            <span>{showLogs ? '隐藏日志' : '实时日志'}</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setExpanded(!expanded)}
            className="size-7 text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </Button>
        </div>
      </div>

      {/* 展开的阶段卡片与步骤条 */}
      {expanded && (
        <div className="p-4 space-y-4">
          {/* 四阶段流水线 Step Flow */}
          <div className="grid grid-cols-4 gap-2.5">
            {steps.map((st) => {
              const state = getStepStatus(st.key)
              return (
                <div
                  key={st.key}
                  className={cn(
                    'p-3 rounded-lg border text-xs transition-all relative overflow-hidden',
                    state === 'active' && 'bg-primary/5 border-primary/40 shadow-2xs',
                    state === 'completed' && 'bg-muted/40 border-border/80',
                    state === 'idle' && 'bg-muted/20 border-border/40 opacity-70',
                    state === 'pending' && 'bg-muted/10 border-border/30 opacity-60'
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={cn(
                        'font-semibold text-xs',
                        state === 'active' ? 'text-primary' : 'text-foreground'
                      )}
                    >
                      {st.label}
                    </span>
                    {state === 'completed' && (
                      <CheckCircle2 className="size-3.5 text-emerald-500" />
                    )}
                    {state === 'active' && (
                      <div className="size-2 rounded-full bg-primary animate-ping" />
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{st.desc}</p>
                </div>
              )
            })}
          </div>

          {/* 实时控制台日志面板 */}
          {showLogs && (
            <div className="mt-2 rounded-lg border border-border/60 bg-muted/40 p-3 font-mono text-xs">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/40 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Terminal className="size-3 text-primary" />
                  <span>Pipeline Execution Stream</span>
                </div>
                <span>{messages.length} 条流水线事件</span>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1 text-foreground/80 text-[11px]">
                {messages.length === 0 ? (
                  <div className="text-muted-foreground italic">暂无流水线历史消息</div>
                ) : (
                  messages.map((msg, i) => (
                    <div key={i} className="leading-relaxed hover:text-foreground">
                      <span className="text-muted-foreground/60 mr-2">[{i + 1}]</span>
                      {msg}
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
