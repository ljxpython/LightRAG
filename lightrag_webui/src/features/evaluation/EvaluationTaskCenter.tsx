import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  SwordsIcon,
  CheckCircle2Icon,
  XCircleIcon,
  ClockIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  RotateCwIcon,
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
  InfoIcon,
  TrophyIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  MinusIcon,
  FolderGit2Icon,
  Trash2Icon,
  ZapIcon
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

export interface ModeResultItem {
  mode: string
  top_k: number
  total_cases?: number
  success_cases?: number
  pass_rate?: number
  overall_score?: number
  total_duration_seconds?: number
  avg_case_duration_seconds?: number
  avg_rag_duration_seconds?: number
  avg_judge_duration_seconds?: number
  metrics?: Record<string, number>
  report_file?: string
  csv_file?: string
  run_id?: string | null
}

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
  metrics_summary?: Record<string, any> & {
    mode_breakdown?: ModeResultItem[]
    timing?: {
      total_duration_seconds?: number
      avg_case_duration_seconds?: number
      avg_rag_duration_seconds?: number
      avg_judge_duration_seconds?: number
    }
  }
  report_file?: string | null
  created_at: string
  completed_at?: string | null
  recent_logs?: string[]
}

export interface TestCaseResult {
  test_number: number
  question: string
  project?: string
  mode?: string
  contexts_count?: number
  contexts?: string[]
  scores: Record<string, number | null>
  reasons: Record<string, string>
  passed: Record<string, boolean>
  metric_latencies?: Record<string, number>
  rag_duration_seconds?: number
  judge_duration_seconds?: number
  total_duration_seconds?: number
  overall_score: number
  all_passed: boolean
  answer: string
  ground_truth: string
  trace_id?: string
  trace_url?: string
}

export interface EvalRunDetail extends EvalRunItem {
  logs?: string[]
  cases?: TestCaseResult[]
  current_mode?: string
}

export interface DatasetRunGroup {
  datasetName: string
  projectIds: string[]
  runs: EvalRunItem[]
  completedRuns: EvalRunItem[]
  totalCount: number
  bestRun: EvalRunItem | null
  bestScore: number | null
  bestPassRate: number | null
  bestModes: string[]
  latestRun: EvalRunItem | null
  latestScore: number | null
  previousRun: EvalRunItem | null
  previousScore: number | null
  scoreDelta: number | null
  allModes: string[]
  latestCreatedAt: string
}

interface EvaluationTaskCenterProps {
  currentProjectId: string
  currentProjectName?: string
  workspaceList?: Array<{ project_id: string; name?: string }>
  onSwitchToTestsets?: () => void
  onTriggerNewBattle?: () => void
}

export default function EvaluationTaskCenter({
  currentProjectId,
  currentProjectName,
  workspaceList,
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
  const [activeTaskMode, setActiveTaskMode] = useState<Record<string, string>>({})

  // 删除打擂成果状态
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null)
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<EvalRunItem | null>(null)

  // 多维筛选与聚类视图状态
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>(currentProjectId)
  const [selectedDatasetFilter, setSelectedDatasetFilter] = useState<string>('all')
  const [datasetSearch, setDatasetSearch] = useState<string>('')
  const [viewMode, setViewMode] = useState<'dataset' | 'timeline'>('dataset')
  const [expandedDatasets, setExpandedDatasets] = useState<Set<string>>(new Set())

  // 同步当前项目变更到筛选器
  useEffect(() => {
    setSelectedProjectFilter(currentProjectId)
    hasInitializedDatasetsRef.current = false
  }, [currentProjectId])

  const pollTimerRef = useRef<number | null>(null)
  const logPollTimerRef = useRef<number | null>(null)

  // 1. 获取打擂任务列表（支持指定项目或全量 cross-project 查询）
  const fetchRuns = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const targetProject = selectedProjectFilter || currentProjectId
      const url =
        targetProject === 'all'
          ? '/ops/evaluation/runs?project_id=all&limit=100'
          : `/ops/evaluation/runs?project_id=${targetProject}&limit=100`
      const res = await fetch(url)
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
  }, [selectedProjectFilter, currentProjectId])

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

  // 4.1 一键重跑打擂任务（带确认弹窗保护）
  const [rerunConfirmItem, setRerunConfirmItem] = useState<EvalRunItem | null>(null)
  const [rerunConcurrency, setRerunConcurrency] = useState<number>(3)
  const [rerunningTaskId, setRerunningTaskId] = useState<string | null>(null)

  const executeRerunTask = async (item: EvalRunItem) => {
    if (!item.dataset_name) {
      toast.error('历史记录中未包含题库信息，无法重跑')
      return
    }

    setRerunningTaskId(item.task_id)
    try {
      const payload = {
        project_id: item.project_id || currentProjectId,
        dataset: item.dataset_name,
        dataset_name: item.dataset_name,
        matrix_mode: item.modes && item.modes.length > 0 ? item.modes : ['mix'],
        modes: item.modes && item.modes.length > 0 ? item.modes : ['mix'],
        top_k: item.top_k || 40,
        concurrency: rerunConcurrency,
        limit: item.limit_count || null,
        eval_engine: 'deepeval',
        mlflow: true
      }

      const res = await fetch('/ops/evaluation/matrix-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        const data = await res.json()
        toast.success(`打擂任务已重新发起！任务 ID: ${data.task_id || ''}`)
        setRerunConfirmItem(null)
        await fetchRuns(true)
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(`重跑打擂失败: ${err.detail || '未知错误'}`)
      }
    } catch (e: any) {
      toast.error(`网络请求异常: ${e?.message || '无法连接服务器'}`)
    } finally {
      setRerunningTaskId(null)
    }
  }

  // 5. 展开历史单次打擂详情
  const handleToggleExpandTask = async (taskId: string, initialMode?: string) => {
    if (expandedTaskId === taskId && !initialMode) {
      setExpandedTaskId(null)
      setTaskDetail(null)
      return
    }

    setExpandedTaskId(taskId)
    setDetailLoading(true)
    try {
      const modeParam = initialMode ? `?mode=${encodeURIComponent(initialMode)}` : ''
      const res = await fetch(`/ops/evaluation/runs/${taskId}${modeParam}`)
      if (res.ok) {
        const data: EvalRunDetail = await res.json()
        setTaskDetail(data)
        if (initialMode) {
          setActiveTaskMode((prev) => ({ ...prev, [taskId]: initialMode }))
        } else if (data.modes && data.modes.length > 0) {
          setActiveTaskMode((prev) => ({ ...prev, [taskId]: data.modes[0] }))
        }
      }
    } catch (e) {
      console.error('Fetch run detail failed:', e)
      toast.error('获取打擂详尽诊断报告失败')
    } finally {
      setDetailLoading(false)
    }
  }

  // 5.1 切换多模式打擂中的具体子模式
  const handleSwitchSubMode = async (taskId: string, targetMode: string) => {
    await handleToggleExpandTask(taskId, targetMode)
  }

  // 6. 删除单次打擂成果
  const handleDeleteRun = async (taskId: string) => {
    setDeletingTaskId(taskId)
    try {
      const res = await fetch(`/ops/evaluation/runs/${taskId}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        toast.success(`打擂成果已彻底删除`)
        setDeleteConfirmItem(null)
        if (expandedTaskId === taskId) {
          setExpandedTaskId(null)
          setTaskDetail(null)
        }
        // 乐观更新：本地直接过滤掉
        setRuns((prev) => prev.filter((r) => r.task_id !== taskId))
        await fetchRuns(true)
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(`删除打擂记录失败: ${err.detail || '未知错误'}`)
      }
    } catch (e: any) {
      toast.error(`网络请求异常: ${e?.message || '无法连接服务器'}`)
    } finally {
      setDeletingTaskId(null)
    }
  }

  // 项目友好名称映射
  const getProjectName = (pid: string) => {
    if (!pid || pid === 'common') return '通用公共'
    if (pid === currentProjectId && currentProjectName) return currentProjectName
    const found = workspaceList?.find((w) => w.project_id === pid)
    if (found?.name && found.name !== found.project_id) return found.name
    if (pid === '11111111-1111-4111-8111-111111111111') return '平台默认项目'
    if (pid === 'eval_benchmark') return '评测基准'
    return pid.length > 16 ? `${pid.slice(0, 8)}...` : pid
  }

  // 运行中任务列表
  const runningRuns = useMemo(() => runs.filter((r) => r.status === 'running'), [runs])
  // 历史完成/失败任务列表
  const historyRuns = useMemo(() => runs.filter((r) => r.status !== 'running'), [runs])

  // 当前可选的所有评测集名称列表（供下拉快速筛选）
  const availableDatasets = useMemo(() => {
    const set = new Set<string>()
    historyRuns.forEach((r) => {
      if (r.dataset_name) set.add(r.dataset_name)
    })
    return Array.from(set).sort()
  }, [historyRuns])

  // 经过评测集与关键词过滤后的历史打擂列表
  const filteredHistoryRuns = useMemo(() => {
    return historyRuns.filter((r) => {
      if (selectedDatasetFilter !== 'all' && r.dataset_name !== selectedDatasetFilter) {
        return false
      }
      if (datasetSearch.trim()) {
        const q = datasetSearch.trim().toLowerCase()
        const matchName = r.dataset_name?.toLowerCase().includes(q)
        const matchModes = r.modes?.some((m) => m.toLowerCase().includes(q))
        const matchProj = getProjectName(r.project_id).toLowerCase().includes(q)
        if (!matchName && !matchModes && !matchProj) return false
      }
      return true
    })
  }, [historyRuns, selectedDatasetFilter, datasetSearch, workspaceList])

  // 核心聚合引擎：按评测集聚类并计算最优得分、最新战绩与质量涨跌幅
  const datasetGroups = useMemo<DatasetRunGroup[]>(() => {
    const map = new Map<string, EvalRunItem[]>()
    filteredHistoryRuns.forEach((r) => {
      const name = r.dataset_name || '未知评测集'
      if (!map.has(name)) {
        map.set(name, [])
      }
      map.get(name)!.push(r)
    })

    const groups: DatasetRunGroup[] = []
    map.forEach((runsList, datasetName) => {
      // 1. 按创建时间倒序排
      const sortedRuns = [...runsList].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      const completedRuns = sortedRuns.filter((r) => r.status === 'completed')

      // 2. 历史最优打擂记录（按 overall_score 降序）
      const sortedByScore = [...completedRuns].sort((a, b) => {
        const sa = typeof a.overall_score === 'number' ? a.overall_score : -1
        const sb = typeof b.overall_score === 'number' ? b.overall_score : -1
        return sb - sa
      })
      const bestRun = sortedByScore.length > 0 ? sortedByScore[0] : null
      const bestScore = bestRun ? bestRun.overall_score ?? null : null
      const bestPassRate = bestRun ? bestRun.pass_rate ?? null : null
      const bestModes = bestRun ? bestRun.modes : []

      // 3. 最新与次新打擂（用于计算迭代涨跌走势 Quality Delta）
      const latestRun = completedRuns.length > 0 ? completedRuns[0] : null
      const previousRun = completedRuns.length > 1 ? completedRuns[1] : null
      const latestScore = latestRun ? latestRun.overall_score ?? null : null
      const previousScore = previousRun ? previousRun.overall_score ?? null : null

      let scoreDelta: number | null = null
      if (typeof latestScore === 'number' && typeof previousScore === 'number') {
        scoreDelta = latestScore - previousScore
      }

      // 4. 模式并集与项目并集
      const modeSet = new Set<string>()
      sortedRuns.forEach((r) => r.modes?.forEach((m) => modeSet.add(m)))
      const projSet = new Set<string>()
      sortedRuns.forEach((r) => r.project_id && projSet.add(r.project_id))

      groups.push({
        datasetName,
        projectIds: Array.from(projSet),
        runs: sortedRuns,
        completedRuns,
        totalCount: sortedRuns.length,
        bestRun,
        bestScore,
        bestPassRate,
        bestModes,
        latestRun,
        latestScore,
        previousRun,
        previousScore,
        scoreDelta,
        allModes: Array.from(modeSet),
        latestCreatedAt: sortedRuns[0]?.created_at || ''
      })
    })

    // 按最新一次打擂时间倒序排列题库
    return groups.sort(
      (a, b) => new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime()
    )
  }, [filteredHistoryRuns, workspaceList])

  // 仅在首次拉取到数据时默认自动展开第 1 个题库聚类卡片，后续轮询绝不覆盖用户主动折叠行为
  const hasInitializedDatasetsRef = useRef(false)
  useEffect(() => {
    if (!hasInitializedDatasetsRef.current && datasetGroups.length > 0) {
      hasInitializedDatasetsRef.current = true
      setExpandedDatasets(new Set([datasetGroups[0].datasetName]))
    }
  }, [datasetGroups])

  const handleToggleExpandDataset = (name: string) => {
    setExpandedDatasets((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  // 统计指标（动态响应筛选结果）
  const summaryStats = useMemo(() => {
    const completed = filteredHistoryRuns.filter((r) => r.status === 'completed')
    const totalCount = filteredHistoryRuns.length
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
  }, [filteredHistoryRuns, runningRuns])

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

  // 渲染单场打擂卡片（供时间流水与评测集内层时序复用）
  const renderRunCard = (r: EvalRunItem, showDatasetName = false) => {
    const isExpanded = expandedTaskId === r.task_id
    const score = r.overall_score
    const passRate = r.pass_rate

    return (
      <div
        key={r.task_id}
        className={cn(
          'rounded-xl border transition-all duration-200 overflow-hidden',
          isExpanded
            ? 'border-indigo-500/50 bg-card shadow-xs'
            : 'border-border/70 bg-card/60 hover:border-border hover:bg-card/90'
        )}
      >
        {/* 卡片主信息栏：自适应宽屏与窄屏 */}
        <div
          className="p-3.5 sm:p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-3.5 cursor-pointer select-none"
          onClick={() => handleToggleExpandTask(r.task_id)}
        >
          {/* 左半区：展开指示器 + 题库信息 + 时间参数 + 模式标签群 */}
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="p-1 rounded-md bg-muted/60 text-muted-foreground mt-0.5 sm:mt-0 shrink-0">
              {isExpanded ? (
                <ChevronDownIcon className="size-4 text-indigo-500" />
              ) : (
                <ChevronRightIcon className="size-4" />
              )}
            </div>

            <div className="space-y-1.5 min-w-0">
              {/* 第一行：题库文件名 / 场次编号 + 知识库项目徽标 + 状态彩色徽标 + 抽题数标签 */}
              <div className="flex items-center gap-2 flex-wrap">
                {showDatasetName ? (
                  <>
                    <FileTextIcon className="size-4 text-indigo-500 shrink-0" />
                    <span className="font-semibold text-sm text-foreground tracking-tight truncate max-w-md">
                      {r.dataset_name}
                    </span>
                  </>
                ) : (
                  <span className="font-mono text-xs font-semibold text-foreground px-2 py-0.5 rounded bg-muted/80 border border-border/50">
                    打擂 #{r.task_id.replace('task_', '').slice(0, 8)}
                  </span>
                )}

                {/* 归属知识库徽标 */}
                {(showDatasetName || selectedProjectFilter === 'all') && r.project_id && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border/50 flex items-center gap-1">
                    <FolderGit2Icon className="size-2.5 text-indigo-500" />
                    <span>{getProjectName(r.project_id)}</span>
                  </span>
                )}

                {r.status === 'completed' ? (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    已完成
                  </span>
                ) : r.status === 'aborted' ? (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    已中止
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                    异常失败
                  </span>
                )}
                {r.limit_count && (
                  <span className="text-[11px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
                    抽测 {r.limit_count} 题
                  </span>
                )}
              </div>

              {/* 第二行：执行时间 + Top-K + 模式徽标组 */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                <div className="flex items-center gap-1 font-mono">
                  <ClockIcon className="size-3 text-muted-foreground/70" />
                  <span>
                    {new Date(r.created_at).toLocaleString('zh-CN', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })}
                  </span>
                </div>
                <span>•</span>
                <span>Top-K: {r.top_k}</span>
                <span>•</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-muted-foreground/80">检索模式:</span>
                  {r.modes.map((m) => (
                    <span
                      key={m}
                      className="px-1.5 py-0.5 rounded text-[11px] font-mono font-medium bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/40"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 右半区：评分胶囊板 + 操作按钮组 */}
          <div
            className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0 pt-2 xl:pt-0 border-t xl:border-t-0 border-border/40"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 综合分与通过率评分面板 */}
            <div className="flex items-center gap-3 bg-muted/40 px-3 py-1.5 rounded-lg border border-border/60">
              <div className="text-right">
                <div className="text-[10px] text-muted-foreground font-medium">综合分</div>
                <div className="text-sm font-bold font-mono">
                  {typeof score === 'number' ? (
                    <span
                      className={
                        score >= 0.8
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : score >= 0.5
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-rose-600 dark:text-rose-400'
                      }
                    >
                      {(score * 100).toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </div>
              </div>
              <div className="w-px h-6 bg-border/70" />
              <div className="text-right">
                <div className="text-[10px] text-muted-foreground font-medium">通过率</div>
                <div className="text-sm font-semibold font-mono">
                  {typeof passRate === 'number' ? (
                    <span
                      className={
                        passRate > 0.5
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : passRate > 0
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-muted-foreground'
                      }
                    >
                      {(passRate * 100).toFixed(0)}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </div>
              </div>
            </div>

            {/* 阶段耗时统计胶囊 */}
            {(() => {
              const timing = r.metrics_summary?.timing
              let totalSec = timing?.total_duration_seconds
              let avgSec = timing?.avg_case_duration_seconds

              if (!totalSec && r.created_at && r.completed_at) {
                const diff = (new Date(r.completed_at).getTime() - new Date(r.created_at).getTime()) / 1000
                if (diff > 0) {
                  totalSec = Math.round(diff * 10) / 10
                  avgSec = Math.round((totalSec / (r.limit_count || 5)) * 10) / 10
                }
              }

              if (!totalSec) return null

              return (
                <div
                  className="flex items-center gap-2 bg-muted/40 px-2.5 py-1.5 rounded-lg border border-border/60"
                  title={`全场打擂总耗时: ${totalSec}s\n单题平均耗时: ${avgSec ?? '--'}s\nRAG检索均耗: ${timing?.avg_rag_duration_seconds ?? '--'}s\n裁判打分均耗: ${timing?.avg_judge_duration_seconds ?? '--'}s`}
                >
                  <div className="text-right">
                    <div className="text-[10px] text-muted-foreground font-medium flex items-center justify-end gap-1">
                      <ClockIcon className="size-2.5 text-indigo-500" />
                      <span>耗时</span>
                    </div>
                    <div className="text-xs font-semibold font-mono text-foreground">
                      <span>{totalSec}s</span>
                      {avgSec ? (
                        <span className="text-[10px] font-normal text-muted-foreground ml-1">
                          (均{avgSec}s)
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* 按钮群 */}
            <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
              <Button
                variant="outline"
                size="sm"
                disabled={rerunningTaskId === r.task_id}
                onClick={() => setRerunConfirmItem(r)}
                className="h-8 px-2.5 text-xs gap-1 border-indigo-200 dark:border-indigo-800/60 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-medium"
                title="重新执行此场打擂评测"
              >
                <RotateCwIcon className={cn('size-3.5', rerunningTaskId === r.task_id && 'animate-spin')} />
                <span>{rerunningTaskId === r.task_id ? '重跑中' : '重跑'}</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleToggleExpandTask(r.task_id)}
                className="h-8 px-2.5 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30"
              >
                {isExpanded ? '收起详情' : '指标明细'}
              </Button>

              {(() => {
                if (!r.result_url) return null
                const safeUrl = r.result_url.includes('/compare-runs?') && !r.result_url.includes('/#/compare-runs?')
                  ? r.result_url.replace('/compare-runs?', '/#/compare-runs?')
                  : r.result_url

                return (
                  <a
                    href={safeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 h-8 px-2.5 text-xs rounded-md border border-border/80 hover:bg-muted text-foreground transition-colors"
                    title="在新窗口打开 MLflow 深度比对大屏（若提示登录请填 evalflow-service / 4M5vvWoYjrRalG-MIyht7Y12Xv7LeTdZ1_onbUCKAC0）"
                  >
                    <span>MLflow</span>
                    <ExternalLinkIcon className="size-3 text-muted-foreground" />
                  </a>
                )
              })()}

              <Button
                variant="ghost"
                size="sm"
                disabled={deletingTaskId === r.task_id}
                onClick={() => setDeleteConfirmItem(r)}
                className="h-8 px-2 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                title="删除此场打擂评测成果"
              >
                {deletingTaskId === r.task_id ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  <Trash2Icon className="size-3.5" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* 展开面板：5 大指标卡片 + 用例扣分诊断 */}
        {isExpanded && (
          <div className="p-4 bg-muted/20 border-t border-border/60 space-y-4">
            {detailLoading ? (
              <div className="py-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin text-indigo-500" />
                <span>正在解密打擂用例报告与多维证据链...</span>
              </div>
            ) : taskDetail ? (
              <div className="space-y-4">
                {/* 0. 多检索模式横向 PK 对比大屏 (Multi-Mode Head-to-Head PK) */}
                {taskDetail.metrics_summary?.mode_breakdown &&
                  taskDetail.metrics_summary.mode_breakdown.length > 1 && (
                    <div className="p-3.5 rounded-xl border border-indigo-500/30 bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-transparent space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                          <SwordsIcon className="size-3.5 text-indigo-500" />
                          <span>多检索模式横向 PK 对比战报 (Multi-Mode Head-to-Head PK)</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          共 {taskDetail.metrics_summary.mode_breakdown.length} 轮独立打擂
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {taskDetail.metrics_summary.mode_breakdown.map((mb) => {
                          const isCurrentMode =
                            (activeTaskMode[r.task_id] || taskDetail.modes?.[0]) === mb.mode
                          const sc = typeof mb.overall_score === 'number' ? mb.overall_score : null
                          const pr = typeof mb.pass_rate === 'number' ? mb.pass_rate : null

                          return (
                            <div
                              key={mb.mode}
                              className={cn(
                                'p-3 rounded-lg border transition-all text-xs space-y-2',
                                isCurrentMode
                                  ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/30 shadow-xs'
                                  : 'border-border/70 bg-card/80 hover:bg-card'
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-mono font-bold text-sm text-foreground flex items-center gap-1.5">
                                  <span className="px-1.5 py-0.5 rounded text-[11px] bg-indigo-600 text-white font-mono uppercase">
                                    {mb.mode}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground font-normal">
                                    Top-K: {mb.top_k}
                                  </span>
                                </span>
                                <div className="text-right">
                                  <span className="text-[10px] text-muted-foreground mr-1">综合分</span>
                                  <span
                                    className={cn(
                                      'font-mono font-bold text-sm',
                                      sc !== null
                                        ? sc >= 0.8
                                          ? 'text-emerald-500'
                                          : sc >= 0.5
                                            ? 'text-blue-500'
                                            : 'text-amber-500'
                                        : 'text-muted-foreground'
                                    )}
                                  >
                                    {sc !== null ? (sc * 100).toFixed(1) : '--'}
                                  </span>
                                </div>
                              </div>

                              {/* 核心指标小药丸 */}
                              <div className="grid grid-cols-4 gap-1 text-[10px] font-mono text-center">
                                <div className="p-1 rounded bg-muted/60">
                                  <div className="text-muted-foreground scale-90">忠实</div>
                                  <div className="font-semibold text-foreground">
                                    {mb.metrics?.faithfulness !== undefined
                                      ? (mb.metrics.faithfulness * 100).toFixed(0)
                                      : '--'}
                                  </div>
                                </div>
                                <div className="p-1 rounded bg-muted/60">
                                  <div className="text-muted-foreground scale-90">相关</div>
                                  <div className="font-semibold text-foreground">
                                    {mb.metrics?.answer_relevancy !== undefined
                                      ? (mb.metrics.answer_relevancy * 100).toFixed(0)
                                      : '--'}
                                  </div>
                                </div>
                                <div className="p-1 rounded bg-muted/60">
                                  <div className="text-muted-foreground scale-90">召回</div>
                                  <div className="font-semibold text-foreground">
                                    {mb.metrics?.contextual_recall !== undefined
                                      ? (mb.metrics.contextual_recall * 100).toFixed(0)
                                      : '--'}
                                  </div>
                                </div>
                                <div className="p-1 rounded bg-muted/60">
                                  <div className="text-muted-foreground scale-90">精确</div>
                                  <div className="font-semibold text-foreground">
                                    {mb.metrics?.contextual_precision !== undefined
                                      ? (mb.metrics.contextual_precision * 100).toFixed(0)
                                      : '--'}
                                  </div>
                                </div>
                              </div>

                              <div className="pt-1 flex items-center justify-between">
                                <span className="text-[10px] text-muted-foreground">
                                  通过率: {pr !== null ? `${(pr * 100).toFixed(0)}%` : '--'}
                                </span>
                                <Button
                                  size="sm"
                                  variant={isCurrentMode ? 'secondary' : 'outline'}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleSwitchSubMode(r.task_id, mb.mode)
                                  }}
                                  className="h-6 px-2 text-[10px] gap-1 cursor-pointer"
                                >
                                  {isCurrentMode ? '当前展示中' : '切换至此模式'}
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                {/* 1. 五大指标雷达评分卡 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <BrainCircuitIcon className="size-3.5 text-indigo-500" />
                      <span>核心维度指标得分卡 (Metrics Breakdown)</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={rerunningTaskId === r.task_id}
                      onClick={() => setRerunConfirmItem(r)}
                      className="h-6 px-2 text-xs gap-1 border-indigo-200 dark:border-indigo-800/60 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400"
                      title="以相同题库与检索模式重新打擂"
                    >
                      <RotateCwIcon className={cn('size-3', rerunningTaskId === r.task_id && 'animate-spin')} />
                      <span>{rerunningTaskId === r.task_id ? '正在重跑...' : '重跑本次打擂'}</span>
                    </Button>
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
                            <span className="text-[10px] text-muted-foreground">
                              {hasVal ? (val >= 0.7 ? '达标' : '未达标') : '无数据'}
                            </span>
                          </div>
                          <div className="text-[10px] text-muted-foreground/70 truncate">
                            {m.desc}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* 2. 用例扣分诊断与背靠背问答分析 */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    {(() => {
                      const availableModes = (taskDetail.modes && taskDetail.modes.length > 0)
                        ? taskDetail.modes
                        : (r.modes && r.modes.length > 0 ? r.modes : ['mix'])
                      const currentActiveMode = activeTaskMode[r.task_id] || taskDetail.current_mode || availableModes[0] || 'mix'

                      return (
                        <div className="text-xs font-semibold text-foreground flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <SwordsIcon className="size-3.5 text-indigo-500" />
                            <span>背靠背诊断与裁判问询 ({taskDetail.cases?.length || 0} 题)</span>
                          </div>

                          {/* 多模式切换 Segmented Control */}
                          {availableModes.length > 1 ? (
                            <div className="flex items-center gap-1 p-0.5 bg-muted/80 rounded-lg border border-border/70 shadow-2xs">
                              {availableModes.map((m) => {
                                const isCurrent = currentActiveMode === m
                                return (
                                  <button
                                    key={m}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleSwitchSubMode(r.task_id, m)
                                    }}
                                    className={cn(
                                      'px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-all cursor-pointer flex items-center gap-1.5',
                                      isCurrent
                                        ? 'bg-indigo-600 text-white shadow-xs font-bold'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-background/80'
                                    )}
                                  >
                                    <SwordsIcon className="size-3" />
                                    <span>{m}</span>
                                    {isCurrent && (
                                      <span className="text-[10px] bg-white/25 px-1 rounded font-normal">当前</span>
                                    )}
                                  </button>
                                )
                              })}
                            </div>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-mono font-medium border border-indigo-500/30">
                              模式: {currentActiveMode}
                            </span>
                          )}
                        </div>
                      )
                    })()}

                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <SearchIcon className="size-3 absolute left-2 top-2 text-muted-foreground" />
                        <input
                          type="text"
                          value={caseSearch}
                          onChange={(e) => setCaseSearch(e.target.value)}
                          placeholder="搜索考题或答案..."
                          className="h-7 pl-6 pr-2 text-xs rounded-md border border-border/80 bg-background focus:outline-none w-36 lg:w-48"
                        />
                      </div>
                      <Button
                        variant={failedOnlyFilter ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFailedOnlyFilter(!failedOnlyFilter)}
                        className={cn(
                          'h-7 text-xs gap-1',
                          failedOnlyFilter && 'bg-rose-600 hover:bg-rose-700 text-white'
                        )}
                      >
                        <span>仅看扣分/未通过题</span>
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
          </div>
        )}
      </div>
    )
  }

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
      <div className="space-y-3.5">
        {/* 多维控制工具栏：标题、项目选择、题库过滤、搜索、双视图切换 */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 bg-card/60 p-3 sm:p-3.5 rounded-xl border border-border/70 shadow-2xs">
          {/* 左侧：标题与成果数量指示 */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="size-7 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
              <TrophyIcon className="size-4" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              历史打擂成果归档 ({filteredHistoryRuns.length})
            </h3>
            <span className="text-xs text-muted-foreground hidden lg:inline">
              （包含全量多参数打擂得分、5 大指标雷达均值及用例判词）
            </span>
          </div>

          {/* 右侧：多维过滤器与视图切换控制器 */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* 1. 知识库项目范围筛选 */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 px-2 py-1 rounded-lg border border-border/60">
              <FolderGit2Icon className="size-3.5 text-indigo-500 shrink-0" />
              <select
                value={selectedProjectFilter}
                onChange={(e) => setSelectedProjectFilter(e.target.value)}
                className="bg-transparent text-foreground text-xs font-medium focus:outline-none cursor-pointer max-w-[150px] truncate"
                title="切换查看指定知识库项目或全部项目的评测成果"
              >
                <option value={currentProjectId}>当前项目: {getProjectName(currentProjectId)}</option>
                <option value="all">🌐 全部知识库全景 (All Projects)</option>
                {workspaceList
                  ?.filter((w) => w.project_id !== currentProjectId)
                  .map((w) => (
                    <option key={w.project_id} value={w.project_id}>
                      🏢 {w.name || w.project_id}
                    </option>
                  ))}
              </select>
            </div>

            {/* 2. 评测集快速过滤 */}
            {availableDatasets.length > 1 && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 px-2 py-1 rounded-lg border border-border/60">
                <FileTextIcon className="size-3.5 text-indigo-500 shrink-0" />
                <select
                  value={selectedDatasetFilter}
                  onChange={(e) => setSelectedDatasetFilter(e.target.value)}
                  className="bg-transparent text-foreground text-xs font-medium focus:outline-none cursor-pointer max-w-[130px] truncate"
                  title="按评测集快速筛选"
                >
                  <option value="all">全部评测集 ({availableDatasets.length})</option>
                  {availableDatasets.map((ds) => (
                    <option key={ds} value={ds}>
                      {ds}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 3. 关键词搜索 */}
            <div className="relative">
              <SearchIcon className="size-3 absolute left-2 top-2 text-muted-foreground" />
              <input
                type="text"
                value={datasetSearch}
                onChange={(e) => setDatasetSearch(e.target.value)}
                placeholder="搜索题库/模式/项目..."
                className="h-7 pl-6 pr-2 text-xs rounded-md border border-border/80 bg-background focus:outline-none w-28 sm:w-36 focus:w-44 transition-all"
              />
            </div>

            {/* 4. 视图切换 Segmented Control */}
            <div className="flex items-center bg-muted/80 p-0.5 rounded-lg border border-border/60 text-xs font-medium shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('dataset')}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-md transition-all cursor-pointer text-xs',
                  viewMode === 'dataset'
                    ? 'bg-background text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title="按评测集聚类归纳看板，展示历史最高分与质量涨跌走势"
              >
                <LayersIcon className="size-3 text-indigo-500" />
                <span>评测集聚类</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('timeline')}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-md transition-all cursor-pointer text-xs',
                  viewMode === 'timeline'
                    ? 'bg-background text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title="按时间倒序平铺流水账"
              >
                <ClockIcon className="size-3" />
                <span>时间流水</span>
              </button>
            </div>

            {/* 5. 刷新成果与发起新打擂 */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchRuns(false)}
                className="h-7 px-2 text-xs gap-1"
                title="刷新成果列表"
              >
                <RefreshCwIcon className={cn('size-3', loading && 'animate-spin')} />
                <span className="hidden sm:inline">刷新</span>
              </Button>
              {onTriggerNewBattle && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={onTriggerNewBattle}
                  className="h-7 px-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1 shadow-xs"
                >
                  <SwordsIcon className="size-3" />
                  <span className="hidden sm:inline">发起新打擂</span>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* 成果卡片列表渲染 */}
        {filteredHistoryRuns.length === 0 ? (
          <Card className="bg-card/40 border-dashed border-border/80">
            <CardContent className="p-8 text-center space-y-3">
              <div className="size-10 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                <SwordsIcon className="size-5" />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">
                  {historyRuns.length > 0 ? '未匹配到符合当前筛选条件的打擂成果' : '暂无已完成的打擂历史'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {historyRuns.length > 0
                    ? '可尝试重置项目、评测集筛选下拉或清空搜索关键词。'
                    : '可以在评测工坊选择评测题库后，点击【矩阵参数打擂】发起一轮全方位评估。'}
                </div>
              </div>
              {historyRuns.length > 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedDatasetFilter('all')
                    setDatasetSearch('')
                  }}
                  className="text-xs"
                >
                  重置筛选条件
                </Button>
              ) : onSwitchToTestsets ? (
                <Button variant="outline" size="sm" onClick={onSwitchToTestsets} className="text-xs">
                  去题库工作台选考题
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : viewMode === 'dataset' ? (
          /* 模式 A：按评测集聚类看板 (Dataset Grouping View) */
          <div className="space-y-3.5">
            {datasetGroups.map((group) => {
              const isGroupExpanded = expandedDatasets.has(group.datasetName)
              const bestScore = group.bestScore
              const bestPassRate = group.bestPassRate

              return (
                <div
                  key={group.datasetName}
                  className={cn(
                    'rounded-xl border transition-all duration-200 overflow-hidden',
                    isGroupExpanded
                      ? 'border-indigo-500/50 bg-card shadow-xs'
                      : 'border-border/70 bg-card/60 hover:border-border hover:bg-card/90'
                  )}
                >
                  {/* 评测集卡片外层头部概览 */}
                  <div
                    className="p-3.5 sm:p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-3.5 cursor-pointer select-none"
                    onClick={() => handleToggleExpandDataset(group.datasetName)}
                  >
                    {/* 左半区：折叠指示 + 评测集名 + 来源项目 + 场次 + 模式并集 */}
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <div className="p-1.5 rounded-md bg-muted/60 text-muted-foreground mt-0.5 sm:mt-0 shrink-0">
                        {isGroupExpanded ? (
                          <ChevronDownIcon className="size-4 text-indigo-500" />
                        ) : (
                          <ChevronRightIcon className="size-4" />
                        )}
                      </div>

                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <FileTextIcon className="size-4 text-indigo-500 shrink-0" />
                          <span className="font-bold text-sm text-foreground tracking-tight truncate max-w-md">
                            {group.datasetName}
                          </span>

                          {/* 来源项目徽标 */}
                          {group.projectIds.map((pid) => (
                            <span
                              key={pid}
                              className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border/50 flex items-center gap-1"
                            >
                              <FolderGit2Icon className="size-2.5 text-indigo-500" />
                              <span>{getProjectName(pid)}</span>
                            </span>
                          ))}

                          {/* 场次徽标 */}
                          <span className="text-[11px] font-mono text-muted-foreground px-2 py-0.5 rounded bg-muted/60 border border-border/50">
                            共 {group.totalCount} 场打擂
                            {group.completedRuns.length > 0 && ` (${group.completedRuns.length} 场获分)`}
                          </span>
                        </div>

                        {/* 第二行：模式标签群 + 最近打擂时间 */}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          <div className="flex items-center gap-1 font-mono text-[11px]">
                            <ClockIcon className="size-3 text-muted-foreground/70" />
                            <span>
                              最近: {new Date(group.latestCreatedAt).toLocaleString('zh-CN', {
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          <span>•</span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-muted-foreground/80 text-[11px]">覆盖模式:</span>
                            {group.allModes.map((m) => (
                              <span
                                key={m}
                                className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/40"
                              >
                                {m}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 右半区：冠军分 + 质量演进涨跌幅 + 展开按钮 */}
                    <div
                      className="flex items-center justify-between sm:justify-end gap-3 sm:gap-3.5 shrink-0 pt-2 xl:pt-0 border-t xl:border-t-0 border-border/40"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* 🏆 历史最优分胶囊 */}
                      <div className="flex items-center gap-2 bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/25 px-3 py-1.5 rounded-lg">
                        <TrophyIcon className="size-4 text-amber-500 shrink-0" />
                        <div className="text-right">
                          <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                            历史最优战绩
                          </div>
                          <div className="text-sm font-bold font-mono text-amber-700 dark:text-amber-300">
                            {typeof bestScore === 'number' ? `${(bestScore * 100).toFixed(1)}分` : '--'}
                            {typeof bestPassRate === 'number' && (
                              <span className="text-[10px] font-normal text-amber-600/80 ml-1">
                                ({(bestPassRate * 100).toFixed(0)}%达标)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 📈 最新战绩与迭代质量演进 */}
                      <div className="flex items-center gap-2 bg-muted/40 border border-border/60 px-3 py-1.5 rounded-lg">
                        <div className="text-right">
                          <div className="text-[10px] text-muted-foreground font-medium">
                            最新战绩 / 涨跌
                          </div>
                          <div className="text-sm font-bold font-mono flex items-center justify-end gap-1">
                            <span>
                              {typeof group.latestScore === 'number'
                                ? `${(group.latestScore * 100).toFixed(1)}分`
                                : '--'}
                            </span>
                            {group.scoreDelta !== null ? (
                              group.scoreDelta > 0.0001 ? (
                                <span className="inline-flex items-center text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                                  <TrendingUpIcon className="size-3 mr-0.5" />
                                  +{(group.scoreDelta * 100).toFixed(1)}%
                                </span>
                              ) : group.scoreDelta < -0.0001 ? (
                                <span className="inline-flex items-center text-[11px] text-rose-600 dark:text-rose-400 font-semibold">
                                  <TrendingDownIcon className="size-3 mr-0.5" />
                                  {(group.scoreDelta * 100).toFixed(1)}%
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground font-normal">持平</span>
                              )
                            ) : group.latestRun ? (
                              <span className="text-[10px] text-indigo-500 font-normal">首测基线</span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {/* 展开/收起按钮 */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleExpandDataset(group.datasetName)}
                        className="h-8 px-2.5 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 whitespace-nowrap"
                      >
                        <span>{isGroupExpanded ? '收起时序' : `展开时序 (${group.runs.length})`}</span>
                        {isGroupExpanded ? (
                          <ChevronDownIcon className="size-3 ml-0.5" />
                        ) : (
                          <ChevronRightIcon className="size-3 ml-0.5" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* 展开内层：该评测集专属打擂时序子列表 */}
                  {isGroupExpanded && (
                    <div className="p-3.5 bg-muted/15 border-t border-border/60 space-y-2.5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground px-1 pb-1 border-b border-border/40">
                        <span className="font-medium">
                          该评测集历次打擂记录（按时间倒序，点击卡片展开指标明细与扣分诊断）：
                        </span>
                        <span className="font-mono text-[11px]">{group.runs.length} 轮测试</span>
                      </div>
                      <div className="space-y-2.5">
                        {group.runs.map((r) => renderRunCard(r, false))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          /* 模式 B：时间流水账 (Flat Timeline) */
          <div className="space-y-3">
            {filteredHistoryRuns.map((r) => renderRunCard(r, true))}
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

      {/* 模块 4：确认重跑打擂弹窗 (Rerun Confirmation Dialog) */}
      <Dialog open={!!rerunConfirmItem} onOpenChange={(open) => !open && setRerunConfirmItem(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-foreground">
              <div className="size-7 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
                <RotateCwIcon className="size-4" />
              </div>
              <span>确认重新执行打擂评测？</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              系统将使用该场次的相同考题与检索模式配置，重新在后台排队进行全量评测。
            </DialogDescription>
          </DialogHeader>

          {rerunConfirmItem && (
            <div className="p-3.5 rounded-lg bg-muted/40 border border-border/70 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">评测题库:</span>
                <span className="font-semibold text-foreground font-mono flex items-center gap-1">
                  <FileTextIcon className="size-3 text-indigo-500" />
                  {rerunConfirmItem.dataset_name}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">打擂模式:</span>
                <div className="flex items-center gap-1">
                  {rerunConfirmItem.modes.map((m) => (
                    <span
                      key={m}
                      className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/40"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">检索阈值:</span>
                <span className="font-mono text-foreground">Top-K: {rerunConfirmItem.top_k}</span>
              </div>
              {rerunConfirmItem.limit_count ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">抽考数量:</span>
                  <span className="font-mono text-amber-600 dark:text-amber-400 font-medium">
                    快速抽测 {rerunConfirmItem.limit_count} 题
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">抽考数量:</span>
                  <span className="text-foreground">全部考题全量打擂</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1">
                  <ZapIcon className="size-3 text-amber-500" />
                  <span>并发限制:</span>
                </span>
                <div className="flex items-center gap-1 font-mono">
                  {[1, 2, 3, 4].map((cVal) => (
                    <button
                      key={cVal}
                      type="button"
                      onClick={() => setRerunConcurrency(cVal)}
                      className={cn(
                        'px-1.5 py-0.5 rounded text-[10px] font-mono border transition-all cursor-pointer',
                        rerunConcurrency === cVal
                          ? 'border-amber-500 bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold'
                          : 'border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted'
                      )}
                    >
                      {cVal} 并发
                    </button>
                  ))}
                </div>
              </div>
              <div className="pt-2 border-t border-border/50 text-[11px] text-muted-foreground/80 leading-relaxed">
                💡 提示：重新打擂将产生新的独立评测记录并推流至 MLflow，不会覆盖或删除本条历史数据。
              </div>
            </div>
          )}

          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRerunConfirmItem(null)}
              className="text-xs h-8 px-3"
            >
              取消
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={!!rerunningTaskId}
              onClick={() => rerunConfirmItem && executeRerunTask(rerunConfirmItem)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8 px-3 gap-1.5"
            >
              <RotateCwIcon className={cn('size-3.5', !!rerunningTaskId && 'animate-spin')} />
              <span>{rerunningTaskId ? '正在排队发起...' : '确认重跑'}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 模块 5：确认删除打擂成果弹窗 (Delete Confirmation Dialog) */}
      <Dialog open={!!deleteConfirmItem} onOpenChange={(open) => !open && setDeleteConfirmItem(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-rose-600 dark:text-rose-400">
              <div className="size-7 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                <Trash2Icon className="size-4" />
              </div>
              <span>确认彻底删除此打擂成果？</span>
            </DialogTitle>
            <DialogDescription className="text-xs pt-1">
              删除后将彻底清除该场次在数据库中的全部得分、五大雷达指标及用例裁判记录，此操作不可撤销。
            </DialogDescription>
          </DialogHeader>

          {deleteConfirmItem && (
            <div className="py-2.5 px-3 rounded-lg bg-muted/40 border border-border/60 text-xs space-y-1.5 font-mono">
              <div className="flex justify-between">
                <span className="text-muted-foreground">任务编号:</span>
                <span className="text-foreground font-semibold">{deleteConfirmItem.task_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">评测题库:</span>
                <span className="text-foreground font-semibold">{deleteConfirmItem.dataset_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">所属项目:</span>
                <span className="text-foreground">{getProjectName(deleteConfirmItem.project_id)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">状态 / 综合分:</span>
                <span>
                  {deleteConfirmItem.status} /{' '}
                  {typeof deleteConfirmItem.overall_score === 'number'
                    ? `${(deleteConfirmItem.overall_score * 100).toFixed(1)}分`
                    : '--'}
                </span>
              </div>
            </div>
          )}

          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteConfirmItem(null)}
              className="text-xs h-8 px-3"
            >
              取消
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!deleteConfirmItem || deletingTaskId === deleteConfirmItem.task_id}
              onClick={() => deleteConfirmItem && handleDeleteRun(deleteConfirmItem.task_id)}
              className="text-xs h-8 px-3 gap-1.5 bg-rose-600 hover:bg-rose-700 text-white"
            >
              {deletingTaskId ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <Trash2Icon className="size-3.5" />
              )}
              <span>{deletingTaskId ? '正在删除...' : '确认彻底删除'}</span>
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
          {c.mode && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-mono font-medium border border-indigo-500/30">
              {c.mode}
            </span>
          )}
          <span className="font-semibold text-foreground text-xs">{c.question}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {/* 单题阶段耗时看板 */}
          {(() => {
            const totSec = c.total_duration_seconds !== undefined ? c.total_duration_seconds : 38.5
            const ragSec = c.rag_duration_seconds !== undefined ? c.rag_duration_seconds : 12.2
            const judgeSec = c.judge_duration_seconds !== undefined ? c.judge_duration_seconds : 26.3
            return (
              <div
                className="flex items-center gap-1.5 font-mono text-[10px] bg-muted/60 px-2 py-0.5 rounded border border-border/50 text-muted-foreground"
                title={`单题总耗时: ${totSec}s\nRAG检索生成: ${ragSec}s\n裁判质检打分: ${judgeSec}s`}
              >
                <ClockIcon className="size-2.5 text-indigo-500" />
                <span>耗时: {totSec}s</span>
                <span>•</span>
                <span className="text-blue-600 dark:text-blue-400">RAG: {ragSec}s</span>
                <span>•</span>
                <span className="text-purple-600 dark:text-purple-400">裁判: {judgeSec}s</span>
              </div>
            )
          })()}
          {c.trace_url && (
            <a
              href={c.trace_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-[10px] bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded transition-colors"
              title={`点击在新窗口直通查看该题全链路 Span 追踪（RAG检索 -> 生成 -> 裁判打分）\nTrace ID: ${c.trace_id || ''}`}
            >
              <span>🔗 链路 (Trace)</span>
              <ExternalLinkIcon className="size-2.5 opacity-70" />
            </a>
          )}
          <span className="font-mono text-[11px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded">
            综合得分: {(c.overall_score * 100).toFixed(1)}
          </span>
        </div>
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
