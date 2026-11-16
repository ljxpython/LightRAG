import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  SwordsIcon,
  CheckCircle2Icon,
  XCircleIcon,
  ClockIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  TerminalIcon,
  StopCircleIcon,
  AlertTriangleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  LayersIcon,
  FileTextIcon,
  BarChart3Icon,
  ShieldCheckIcon,
  TargetIcon,
  BrainCircuitIcon,
  Loader2Icon,
  ArrowUpRightIcon,
  SparklesIcon,
  SearchIcon,
  InfoIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import Button from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import Progress from '@/components/ui/Progress'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/Dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/Table'

export interface EvalRunItem {
  task_id: string
  project_id: string
  dataset_name: string
  modes: string[]
  top_k: number
  limit_count?: number | null
  status: 'running' | 'completed' | 'failed' | 'aborted'
  progress: number
  runs: string[]
  result_url?: string | null
  overall_score?: number | null
  pass_rate?: number | null
  metrics_summary?: Record<string, number>
  report_file?: string | null
  created_at: string
  completed_at?: string | null
  recent_logs?: string[]
}

export interface TestCaseResult {
  test_number: number
  question: string
  project?: string
  contexts_count?: number
  contexts?: string[]
  scores: Record<string, number | null>
  reasons: Record<string, string>
  passed: Record<string, boolean>
  overall_score: number
  all_passed: boolean
  answer: string
  ground_truth: string
}

export interface EvalRunDetail extends EvalRunItem {
  logs?: string[]
  cases?: TestCaseResult[]
}

interface EvaluationTaskCenterProps {
  currentProjectId: string
  onSwitchToTestsets?: () => void
  onTriggerNewBattle?: () => void
}

export default function EvaluationTaskCenter({
  currentProjectId,
  onSwitchToTestsets,
  onTriggerNewBattle
}: EvaluationTaskCenterProps) {
  const [runs, setRuns] = useState<EvalRunItem[]>([])
  const [loading, setLoading] = useState(false)
  const [activeLogTaskId, setActiveLogTaskId] = useState<string | null>(null)
  const [activeLogTask, setActiveLogTask] = useState<EvalRunDetail | null>(null)
  const [logLoading, setLogLoading] = useState(false)
  const [abortingId, setAbortingId] = useState<string | null>(null)

  // 展开某次任务查看用例诊断
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [taskDetail, setTaskDetail] = useState<EvalRunDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [failedOnlyFilter, setFailedOnlyFilter] = useState(false)
  const [caseSearch, setCaseSearch] = useState('')

  const pollTimerRef = useRef<number | null>(null)
  const logPollTimerRef = useRef<number | null>(null)

  // 1. 获取打擂任务列表
  const fetchRuns = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await fetch(`/ops/evaluation/runs?project_id=${currentProjectId}`)
      if (res.ok) {
        const data: EvalRunItem[] = await res.json()
        setRuns(data)
      }
    } catch (e) {
      console.error('Fetch evaluation runs failed:', e)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    fetchRuns()
  }, [currentProjectId])

  // 2. 智能轮询：若存在 running 任务，每 2.5 秒刷新列表
  const hasRunning = useMemo(() => {
    return runs.some((r) => r.status === 'running')
  }, [runs])

  useEffect(() => {
    if (pollTimerRef.current) window.clearInterval(pollTimerRef.current)
    if (hasRunning) {
      pollTimerRef.current = window.setInterval(() => {
        fetchRuns(true)
      }, 2500)
    }
    return () => {
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current)
    }
  }, [hasRunning, currentProjectId])

  // 3. 打开日志弹窗并轮询日志
  const handleOpenLogs = async (taskId: string) => {
    setActiveLogTaskId(taskId)
    setLogLoading(true)
    try {
      const res = await fetch(`/ops/evaluation/runs/${taskId}`)
      if (res.ok) {
        const data: EvalRunDetail = await res.json()
        setActiveLogTask(data)
      }
    } catch (e) {
      console.error('Fetch task log detail failed:', e)
    } finally {
      setLogLoading(false)
    }

    if (logPollTimerRef.current) window.clearInterval(logPollTimerRef.current)
    logPollTimerRef.current = window.setInterval(async () => {
      try {
        const res = await fetch(`/ops/evaluation/runs/${taskId}`)
        if (res.ok) {
          const data: EvalRunDetail = await res.json()
          setActiveLogTask(data)
          if (data.status !== 'running' && logPollTimerRef.current) {
            window.clearInterval(logPollTimerRef.current)
          }
        }
      } catch (err) {
        console.warn('Poll task log error:', err)
      }
    }, 2000)
  }

  const handleCloseLogs = () => {
    if (logPollTimerRef.current) window.clearInterval(logPollTimerRef.current)
    setActiveLogTaskId(null)
    setActiveLogTask(null)
  }

  // 4. 中止任务
  const handleAbortTask = async (taskId: string) => {
    if (!window.confirm(`确定要强制中止打擂任务 [${taskId}] 吗？`)) return
    setAbortingId(taskId)
    try {
      const res = await fetch(`/ops/evaluation/tasks/${taskId}/abort`, {
        method: 'POST'
      })
      if (res.ok) {
        toast.success(`打擂任务 ${taskId} 已成功中止`)
        fetchRuns(true)
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(`中止任务失败: ${err.detail || '未知错误'}`)
      }
    } catch (e) {
      toast.error('网络请求失败，无法中止任务')
    } finally {
      setAbortingId(null)
    }
  }

  // 5. 展开历史单次打擂详情
  const handleToggleExpandTask = async (taskId: string) => {
    if (expandedTaskId === taskId) {
      setExpandedTaskId(null)
      setTaskDetail(null)
      return
    }

    setExpandedTaskId(taskId)
    setDetailLoading(true)
    try {
      const res = await fetch(`/ops/evaluation/runs/${taskId}`)
      if (res.ok) {
        const data: EvalRunDetail = await res.json()
        setTaskDetail(data)
      }
    } catch (e) {
      console.error('Fetch run detail failed:', e)
      toast.error('获取打擂详尽诊断报告失败')
    } finally {
      setDetailLoading(false)
    }
  }

  // 运行中任务列表
  const runningRuns = useMemo(() => runs.filter((r) => r.status === 'running'), [runs])
  // 历史完成/失败任务列表
  const historyRuns = useMemo(() => runs.filter((r) => r.status !== 'running'), [runs])

  // 统计指标
  const summaryStats = useMemo(() => {
    const completed = historyRuns.filter((r) => r.status === 'completed')
    const totalCount = runs.length
    const scores = completed
      .map((r) => r.overall_score)
      .filter((s): s is number => typeof s === 'number')
    const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : '--'
    const passRates = completed
      .map((r) => r.pass_rate)
      .filter((p): p is number => typeof p === 'number')
    const maxPassRate = passRates.length > 0 ? `${(Math.max(...passRates) * 100).toFixed(0)}%` : '--'
    return {
      totalCount,
      runningCount: runningRuns.length,
      completedCount: completed.length,
      avgScore,
      maxPassRate
    }
  }, [runs, historyRuns, runningRuns])

  // 过滤用例明细
  const filteredCases = useMemo(() => {
    if (!taskDetail || !taskDetail.cases) return []
    let list = taskDetail.cases
    if (failedOnlyFilter) {
      list = list.filter((c) => !c.all_passed)
    }
    if (caseSearch.trim()) {
      const q = caseSearch.toLowerCase()
      list = list.filter(
        (c) =>
          c.question.toLowerCase().includes(q) ||
          c.ground_truth.toLowerCase().includes(q) ||
          c.answer.toLowerCase().includes(q)
      )
    }
    return list
  }, [taskDetail, failedOnlyFilter, caseSearch])

  return (
    <div className="space-y-6">
      {/* 顶部统计 KPI 胶囊卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <Card className="bg-card/70 border border-border/60 shadow-xs">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-medium text-muted-foreground">总打擂场次</div>
              <div className="text-xl font-bold tracking-tight text-foreground mt-0.5">
                {summaryStats.totalCount}
              </div>
            </div>
            <div className="size-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
              <SwordsIcon className="size-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/70 border border-border/60 shadow-xs">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-medium text-muted-foreground">正在并发打擂</div>
              <div className="text-xl font-bold tracking-tight text-amber-500 mt-0.5">
                {summaryStats.runningCount}
              </div>
            </div>
            <div className="size-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Loader2Icon className={cn('size-4', summaryStats.runningCount > 0 && 'animate-spin')} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/70 border border-border/60 shadow-xs">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-medium text-muted-foreground">历史平均综合分</div>
              <div className="text-xl font-bold tracking-tight text-emerald-500 mt-0.5">
                {summaryStats.avgScore}
              </div>
            </div>
            <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <BarChart3Icon className="size-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/70 border border-border/60 shadow-xs">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-medium text-muted-foreground">最高全项通过率</div>
              <div className="text-xl font-bold tracking-tight text-blue-500 mt-0.5">
                {summaryStats.maxPassRate}
              </div>
            </div>
            <div className="size-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <ShieldCheckIcon className="size-4" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 模块 1：⚡ 进行中的打擂任务流 (Active Running Queue) */}
      {runningRuns.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="size-2 rounded-full bg-amber-500 animate-ping" />
              <h3 className="text-sm font-semibold text-foreground">
                正在并发执行的打擂任务 ({runningRuns.length})
              </h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchRuns(false)}
              className="h-7 text-xs text-muted-foreground gap-1"
            >
              <RefreshCwIcon className={cn('size-3', loading && 'animate-spin')} />
              <span>刷新</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {runningRuns.map((r) => (
              <Card
                key={r.task_id}
                className="bg-card/90 border border-amber-500/30 dark:border-amber-500/20 shadow-xs relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500/20">
                  <div
                    className="h-full bg-amber-500 transition-all duration-300"
                    style={{ width: `${r.progress}%` }}
                  />
                </div>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-foreground">
                          {r.task_id}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
                          <Loader2Icon className="size-2.5 animate-spin" />
                          <span>打擂中 {r.progress}%</span>
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                        <span>题库: {r.dataset_name}</span>
                        <span>•</span>
                        <span>模式: {r.modes.join(', ')}</span>
                        {r.limit_count && <span>(快速 {r.limit_count} 题)</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenLogs(r.task_id)}
                        className="h-7 px-2 text-xs gap-1"
                        tooltip="查看实时推流日志"
                      >
                        <TerminalIcon className="size-3 text-indigo-500" />
                        <span>日志</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={abortingId === r.task_id}
                        onClick={() => handleAbortTask(r.task_id)}
                        className="h-7 px-2 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 gap-1"
                        tooltip="强制终止当前打擂"
                      >
                        <StopCircleIcon className="size-3" />
                        <span>终止</span>
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>流式推流进度</span>
                      <span className="font-mono font-medium text-foreground">{r.progress}%</span>
                    </div>
                    <Progress value={r.progress} className="h-1.5 bg-muted" />
                  </div>

                  {r.recent_logs && r.recent_logs.length > 0 && (
                    <div className="bg-muted/40 rounded p-2 text-[11px] font-mono text-muted-foreground truncate border border-border/30">
                      &gt; {r.recent_logs[r.recent_logs.length - 1]}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 模块 2：🏆 历史打擂成果表与指标总览 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              历史打擂成果归档 ({historyRuns.length})
            </h3>
            <span className="text-xs text-muted-foreground">
              （包含全量多参数打擂得分、5 大指标雷达均值及用例判词）
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchRuns(false)}
              className="h-7 text-xs gap-1"
            >
              <RefreshCwIcon className={cn('size-3', loading && 'animate-spin')} />
              <span>刷新成果</span>
            </Button>
            {onTriggerNewBattle && (
              <Button
                variant="default"
                size="sm"
                onClick={onTriggerNewBattle}
                className="h-7 bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1"
              >
                <SwordsIcon className="size-3" />
                <span>发起新打擂</span>
              </Button>
            )}
          </div>
        </div>

        {historyRuns.length === 0 ? (
          <Card className="bg-card/40 border-dashed border-border/80">
            <CardContent className="p-8 text-center space-y-3">
              <div className="size-10 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                <SwordsIcon className="size-5" />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">暂无已完成的打擂历史</div>
                <div className="text-xs text-muted-foreground">
                  可以在评测工坊选择评测题库后，点击【矩阵参数打擂】发起一轮全方位评估。
                </div>
              </div>
              {onSwitchToTestsets && (
                <Button variant="outline" size="sm" onClick={onSwitchToTestsets} className="text-xs">
                  去题库工作台选考题
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="border border-border/60 rounded-lg overflow-hidden bg-card/60 shadow-xs">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-8"></TableHead>
                  <TableHead className="w-36 text-xs">执行时间</TableHead>
                  <TableHead className="text-xs">评测题库</TableHead>
                  <TableHead className="w-28 text-xs">检索模式</TableHead>
                  <TableHead className="w-24 text-xs text-center">综合分</TableHead>
                  <TableHead className="w-24 text-xs text-center">通过率</TableHead>
                  <TableHead className="w-24 text-xs text-center">状态</TableHead>
                  <TableHead className="w-40 text-xs text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyRuns.map((r) => {
                  const isExpanded = expandedTaskId === r.task_id
                  const score = r.overall_score
                  const passRate = r.pass_rate

                  return (
                    <React.Fragment key={r.task_id}>
                      <TableRow
                        className={cn(
                          'cursor-pointer transition-colors hover:bg-muted/20',
                          isExpanded && 'bg-muted/30 font-medium'
                        )}
                        onClick={() => handleToggleExpandTask(r.task_id)}
                      >
                        <TableCell className="p-2 text-center text-muted-foreground">
                          {isExpanded ? (
                            <ChevronDownIcon className="size-4 text-indigo-500" />
                          ) : (
                            <ChevronRightIcon className="size-4" />
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {new Date(r.created_at).toLocaleString('zh-CN', {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-xs text-foreground font-medium">
                            <FileTextIcon className="size-3.5 text-indigo-500" />
                            <span>{r.dataset_name}</span>
                            {r.limit_count && (
                              <span className="text-[10px] text-muted-foreground px-1.5 py-0.2 rounded bg-muted">
                                抽取 {r.limit_count} 题
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {r.modes.join(', ')}
                        </TableCell>
                        <TableCell className="text-center font-mono">
                          {typeof score === 'number' ? (
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded text-xs font-bold',
                                score >= 0.8
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : score >= 0.5
                                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                              )}
                            >
                              {(score * 100).toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">--</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center font-mono">
                          {typeof passRate === 'number' ? (
                            <span
                              className={cn(
                                'text-xs font-semibold',
                                passRate > 0.5
                                  ? 'text-emerald-500'
                                  : passRate > 0
                                    ? 'text-amber-500'
                                    : 'text-muted-foreground'
                              )}
                            >
                              {(passRate * 100).toFixed(0)}%
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">--</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {r.status === 'completed' ? (
                            <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              已完成
                            </span>
                          ) : r.status === 'aborted' ? (
                            <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
                              已中止
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400">
                              异常失败
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right space-x-1.5" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleExpandTask(r.task_id)}
                            className="h-7 px-2 text-xs text-indigo-600 dark:text-indigo-400"
                          >
                            {isExpanded ? '收起详情' : '指标明细'}
                          </Button>

                          {r.result_url && (
                            <a
                              href={r.result_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 h-7 px-2 text-xs rounded border border-border/80 hover:bg-muted/50 text-foreground transition-colors"
                              title="在新窗口打开 MLflow 深度比对大屏"
                            >
                              <span>MLflow</span>
                              <ExternalLinkIcon className="size-3 text-muted-foreground" />
                            </a>
                          )}
                        </TableCell>
                      </TableRow>

                      {/* 展开面板：5 大指标卡片 + 用例扣分诊断 */}
                      {isExpanded && (
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={8} className="p-4 space-y-4">
                            {detailLoading ? (
                              <div className="py-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                                <Loader2Icon className="size-4 animate-spin text-indigo-500" />
                                <span>正在解密打擂用例报告与多维证据链...</span>
                              </div>
                            ) : taskDetail ? (
                              <div className="space-y-4">
                                {/* 1. 五大指标雷达评分卡 */}
                                <div>
                                  <div className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                                    <BrainCircuitIcon className="size-3.5 text-indigo-500" />
                                    <span>核心维度指标得分卡 (Metrics Breakdown)</span>
                                  </div>
                                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
                                    {[
                                      {
                                        key: 'faithfulness',
                                        label: '忠实度 (Faithfulness)',
                                        desc: '防幻觉·材料实证支撑'
                                      },
                                      {
                                        key: 'answer_relevancy',
                                        label: '回答相关性 (Relevancy)',
                                        desc: '紧扣提问·无废话'
                                      },
                                      {
                                        key: 'contextual_recall',
                                        label: '检索召回率 (Recall)',
                                        desc: '黄金标准答案覆盖率'
                                      },
                                      {
                                        key: 'contextual_precision',
                                        label: '检索精确度 (Precision)',
                                        desc: '有效切片排序靠前度'
                                      },
                                      {
                                        key: 'counterfactual_assertion',
                                        label: '反事实抗扰度 (Counterfactual)',
                                        desc: '抵御伪造事实诱导'
                                      }
                                    ].map((m) => {
                                      const val = taskDetail.metrics_summary?.[m.key]
                                      const hasVal = typeof val === 'number'

                                      return (
                                        <div
                                          key={m.key}
                                          className="p-3 rounded-lg bg-card border border-border/70 space-y-1.5 shadow-2xs"
                                        >
                                          <div className="text-[11px] font-medium text-muted-foreground truncate">
                                            {m.label}
                                          </div>
                                          <div className="flex items-baseline justify-between">
                                            <div
                                              className={cn(
                                                'text-lg font-bold font-mono',
                                                hasVal
                                                  ? val >= 0.8
                                                    ? 'text-emerald-500'
                                                    : val >= 0.5
                                                      ? 'text-blue-500'
                                                      : 'text-amber-500'
                                                  : 'text-muted-foreground'
                                              )}
                                            >
                                              {hasVal ? (val * 100).toFixed(1) : 'N/A'}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground">
                                              {m.desc}
                                            </div>
                                          </div>
                                          <Progress
                                            value={hasVal ? val * 100 : 0}
                                            className="h-1 bg-muted"
                                          />
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>

                                {/* 2. 用例扣分诊断清单 */}
                                <div className="space-y-2 pt-2 border-t border-border/40">
                                  <div className="flex items-center justify-between">
                                    <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                      <TargetIcon className="size-3.5 text-rose-500" />
                                      <span>用例扣分诊断与裁判判词 ({filteredCases.length} 题)</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setFailedOnlyFilter(!failedOnlyFilter)}
                                        className={cn(
                                          'h-6 text-[11px] px-2',
                                          failedOnlyFilter
                                            ? 'bg-rose-500/10 border-rose-500/40 text-rose-600 dark:text-rose-400 font-semibold'
                                            : 'text-muted-foreground'
                                        )}
                                      >
                                        仅看扣分/未通过题目
                                      </Button>
                                    </div>
                                  </div>

                                  <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                                    {filteredCases.map((c) => (
                                      <TestCaseCard key={c.test_number} c={c} />
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* 模块 3：终端实时推流日志弹窗 (Terminal Log Modal) */}
      <Dialog open={!!activeLogTaskId} onOpenChange={(open) => !open && handleCloseLogs()}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-mono text-sm">
              <TerminalIcon className="size-4 text-indigo-500" />
              <span>打擂执行实时推流终端 ({activeLogTaskId})</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              实时监听后端 deepeval_runner 与 LightRAG 检索流水线的现场输出。
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-[350px] max-h-[480px] bg-slate-950 text-slate-100 p-3.5 rounded-md font-mono text-xs overflow-y-auto space-y-1 shadow-inner border border-slate-800">
            {logLoading ? (
              <div className="h-full flex items-center justify-center text-slate-500 gap-2">
                <Loader2Icon className="size-4 animate-spin" />
                <span>正在建立流式终端连接...</span>
              </div>
            ) : activeLogTask?.logs && activeLogTask.logs.length > 0 ? (
              activeLogTask.logs.map((line, idx) => (
                <div key={idx} className="leading-relaxed hover:bg-slate-900/60 px-1 rounded">
                  <span className="text-slate-500 mr-2 select-none">{idx + 1}</span>
                  <span>{line}</span>
                </div>
              ))
            ) : (
              <div className="text-slate-500 text-center py-12">暂无流式日志</div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>流式连接正常</span>
            </div>
            <Button variant="secondary" size="sm" onClick={handleCloseLogs} className="text-xs">
              关闭终端
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TestCaseCard({ c }: { c: TestCaseResult }) {
  const [showFullAnswer, setShowFullAnswer] = useState(false)
  const [showContexts, setShowContexts] = useState(false)

  const hasContexts = c.contexts && c.contexts.length > 0
  const contextsCount = c.contexts?.length || c.contexts_count || 0

  return (
    <div
      className={cn(
        'p-3.5 rounded-lg border text-xs space-y-2.5 bg-card/90 shadow-2xs transition-all',
        c.all_passed ? 'border-emerald-500/30' : 'border-rose-500/30'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'px-1.5 py-0.5 rounded text-[10px] font-mono font-bold',
              c.all_passed
                ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-600 border border-rose-500/20'
            )}
          >
            #{c.test_number} {c.all_passed ? 'PASS' : 'FAIL'}
          </span>
          <span className="font-semibold text-foreground text-xs">{c.question}</span>
        </div>
        <span className="font-mono text-[11px] text-muted-foreground shrink-0 bg-muted/60 px-2 py-0.5 rounded">
          综合得分: {(c.overall_score * 100).toFixed(1)}
        </span>
      </div>

      {/* 核心对比区：黄金答案 vs 模型回答 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-[11px]">
        {/* 标准黄金答案 */}
        <div className="bg-emerald-500/5 border border-emerald-500/20 p-2.5 rounded-md space-y-1">
          <div className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1 text-[10px]">
            <CheckCircle2Icon className="size-3" />
            <span>黄金标准答案 (Ground Truth):</span>
          </div>
          <div className="text-foreground font-medium leading-relaxed">{c.ground_truth}</div>
        </div>

        {/* 模型实际回答 */}
        <div className="bg-indigo-500/5 border border-indigo-500/20 p-2.5 rounded-md space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-indigo-700 dark:text-indigo-400 font-semibold flex items-center gap-1">
              <BrainCircuitIcon className="size-3" />
              <span>模型实际回答 (Actual Answer):</span>
            </span>
            {c.answer && c.answer.length > 80 && (
              <button
                type="button"
                onClick={() => setShowFullAnswer(!showFullAnswer)}
                className="text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                {showFullAnswer ? '收起' : '展开全文'}
              </button>
            )}
          </div>
          <div
            className={cn(
              'text-foreground leading-relaxed',
              !showFullAnswer && 'line-clamp-3'
            )}
          >
            {c.answer || <span className="text-muted-foreground italic">未返回回答内容</span>}
          </div>
        </div>
      </div>

      {/* 纯检索内容 (Retrieved Contexts 切片) */}
      <div className="border border-border/60 rounded-md bg-muted/20 overflow-hidden">
        <div
          onClick={() => setShowContexts(!showContexts)}
          className="flex items-center justify-between px-2.5 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors select-none"
        >
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <LayersIcon className="size-3.5 text-amber-500" />
            <span>检索器召回切片 (Retrieved Contexts)</span>
            <span className="font-mono text-[10px] bg-muted px-1.5 py-0.2 rounded border border-border/40">
              {contextsCount} 个切片
            </span>
          </div>
          <div className="text-[10px] text-indigo-600 dark:text-indigo-400 flex items-center gap-0.5">
            <span>{showContexts ? '收起切片' : '查看切片原文'}</span>
            <ChevronDownIcon
              className={cn('size-3 transition-transform', showContexts && 'rotate-180')}
            />
          </div>
        </div>

        {showContexts && (
          <div className="p-2.5 border-t border-border/40 space-y-2 bg-background/50">
            {hasContexts ? (
              c.contexts!.map((ctx, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded bg-muted/30 border border-border/40 text-[11px] font-mono leading-relaxed space-y-1"
                >
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground border-b border-border/20 pb-0.5">
                    <span className="font-bold text-amber-600 dark:text-amber-400">
                      切片 #{idx + 1}
                    </span>
                    <span>{ctx.length} 字符</span>
                  </div>
                  <div className="text-foreground whitespace-pre-wrap">{ctx}</div>
                </div>
              ))
            ) : (
              <div className="text-[11px] text-muted-foreground p-2 text-center italic">
                该历史评测已记录检索切片数（共 {contextsCount} 个），但未全量持久化切片正文。新发起的评测将完整呈现每个切片的文本。
              </div>
            )}
          </div>
        )}
      </div>

      {/* 裁判裁决理由 (Judgement Reasons) */}
      <div className="space-y-1">
        <span className="text-[10px] text-muted-foreground font-semibold">
          裁判裁决理由 (Judgement Reasons):
        </span>
        <div className="grid grid-cols-1 gap-1">
          {Object.entries(c.reasons || {}).map(([mName, rText]) => (
            <div
              key={mName}
              className="text-[11px] text-muted-foreground bg-muted/40 p-1.5 rounded font-mono"
            >
              <span className="font-semibold text-foreground mr-1">[{mName}]:</span>
              <span>{rText}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
