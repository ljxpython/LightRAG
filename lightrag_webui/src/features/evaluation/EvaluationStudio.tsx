import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  ActivityIcon,
  SparklesIcon,
  SwordsIcon,
  SaveIcon,
  PlusIcon,
  Trash2Icon,
  ExternalLinkIcon,
  RefreshCwIcon,
  FileTextIcon,
  HashIcon,
  LayersIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  Loader2Icon,
  SearchIcon,
  TableIcon,
  BarChart3Icon,
  Maximize2Icon,
  FolderGit2Icon,
  InfoIcon,
  ArrowUpRightIcon,
  Settings2Icon,
  Edit3Icon,
  AlertCircleIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorkspaceStore } from '@/stores/workspace'
import { toast } from 'sonner'
import Button from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/Dialog'
import Progress from '@/components/ui/Progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/Table'

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------
interface CorpusManifest {
  project_id: string
  tenant_id: string
  revision: string
  doc_count: number
  doc_ids: string[]
  corpus_hash: string
  created_at: string
  generator: string
}

interface TestCase {
  id?: string
  question?: string
  query?: string
  input?: string
  ground_truth?: string
  expected_output?: string
  context?: string[]
  contexts?: string[]
  metadata?: Record<string, any>
}

interface DatasetDetail {
  name: string
  corpus_manifest?: CorpusManifest
  cases_count: number
  cases: TestCase[]
  created_at?: string
  updated_at?: string
}

interface DatasetSummary {
  name: string
  project_id?: string
  revision?: string
  cases_count: number
  created_at?: string
  corpus_hash?: string
}

interface AsyncTaskStatus {
  task_id: string
  type: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  message: string
  result?: any
  error?: string
}

/** 提取考题的支撑切片数组，清洗空串并去除无效值 */
function getCaseContexts(c: TestCase | null | undefined): string[] {
  if (!c) return []
  if (Array.isArray(c.contexts) && c.contexts.length > 0) {
    return c.contexts.map((s) => String(s || '').trim()).filter(Boolean)
  }
  if (c.context && typeof c.context === 'string' && c.context.trim()) {
    return [c.context.trim()]
  }
  return []
}

export default function EvaluationStudio() {
  const { currentTenantId, currentProjectId } = useWorkspaceStore()

  // 顶层子视图切换：'cases' (考题表格) | 'mlflow' (内嵌评测大屏)
  const [activeSubTab, setActiveSubTab] = useState<'cases' | 'mlflow'>('cases')

  // MLflow 评测平台接入地址（默认直连生产真实端口 9128，支持用户持久化微调）
  const [mlflowUrl, setMlflowUrl] = useState<string>(() => {
    return localStorage.getItem('omnirag_eval_mlflow_url') || 'http://49.233.222.54:9128'
  })
  const [tempMlflowUrl, setTempMlflowUrl] = useState<string>(mlflowUrl)
  const [showUrlConfig, setShowUrlConfig] = useState(false)

  // 题库管理状态
  const [datasets, setDatasets] = useState<DatasetSummary[]>([])
  const [selectedDatasetName, setSelectedDatasetName] = useState<string>('')
  const [datasetDetail, setDatasetDetail] = useState<DatasetDetail | null>(null)
  const [loadingDatasets, setLoadingDatasets] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // 考题在线编辑与脏状态
  const [cases, setCases] = useState<TestCase[]>([])
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // 单题详情检视模态框与上下文在线编辑
  const [inspectCase, setInspectCase] = useState<TestCase | null>(null)
  const [editingContextText, setEditingContextText] = useState<string>('')
  const [isEditingContext, setIsEditingContext] = useState<boolean>(false)

  // 模态框 1：自动合成考题
  const [synthOpen, setSynthOpen] = useState(false)
  const [synthName, setSynthName] = useState('')
  const [synthCount, setSynthCount] = useState<number>(5)
  const [synthCrudDiff, setSynthCrudDiff] = useState(true)
  const [synthTaskId, setSynthTaskId] = useState<string | null>(null)
  const [synthTaskStatus, setSynthTaskStatus] = useState<AsyncTaskStatus | null>(null)

  // 模态框 2：多参数矩阵打擂
  const [matrixOpen, setMatrixOpen] = useState(false)
  const [selectedModes, setSelectedModes] = useState<string[]>(['mix', 'hybrid'])
  const [topK, setTopK] = useState<number>(60)
  const [evalEngine, setEvalEngine] = useState<string>('deepeval')
  const [matrixTaskId, setMatrixTaskId] = useState<string | null>(null)
  const [matrixTaskStatus, setMatrixTaskStatus] = useState<AsyncTaskStatus | null>(null)

  // iframe 刷新控制
  const [iframeKey, setIframeKey] = useState(0)

  // 知识库列表用于友好名称映射
  const [workspaceList, setWorkspaceList] = useState<Array<{ project_id: string; name?: string }>>([])

  useEffect(() => {
    fetch('/ops/workspaces')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setWorkspaceList(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [currentProjectId])

  // 当前激活项目的友好名称（与右上角 100% 对齐）
  const currentProjectName = useMemo(() => {
    const found = workspaceList.find((w) => w.project_id === currentProjectId)
    if (found?.name && found.name !== found.project_id) return found.name
    if (currentProjectId === '11111111-1111-4111-8111-111111111111') return '平台默认项目'
    if (currentProjectId === 'eval_benchmark') return '评测基准'
    return currentProjectId.length > 16 ? `${currentProjectId.slice(0, 8)}...` : currentProjectId
  }, [workspaceList, currentProjectId])

  // 轮询 Ref
  const synthPollTimer = useRef<number | null>(null)
  const matrixPollTimer = useRef<number | null>(null)

  // -------------------------------------------------------------------------
  // 1. 加载题库列表
  // -------------------------------------------------------------------------
  const fetchDatasets = async (targetToSelect?: string) => {
    try {
      setLoadingDatasets(true)
      const res = await fetch('/ops/evaluation/datasets')
      if (res.ok) {
        const data = await res.json()
        const list: DatasetSummary[] = data.datasets || []
        setDatasets(list)

        if (list.length > 0) {
          const nextName =
            targetToSelect ||
            (list.some((d) => d.name === selectedDatasetName) ? selectedDatasetName : list[0].name)
          setSelectedDatasetName(nextName)
        } else {
          setSelectedDatasetName('')
          setDatasetDetail(null)
          setCases([])
        }
      }
    } catch (err) {
      console.error('Failed to fetch evaluation datasets:', err)
      toast.error('加载评测题库列表失败')
    } finally {
      setLoadingDatasets(false)
    }
  }

  // -------------------------------------------------------------------------
  // 2. 加载选中的题库明细
  // -------------------------------------------------------------------------
  const fetchDatasetDetail = async (name: string) => {
    if (!name) return
    try {
      setLoadingDetail(true)
      const res = await fetch(`/ops/evaluation/datasets/${encodeURIComponent(name)}`)
      if (res.ok) {
        const data: DatasetDetail = await res.json()
        setDatasetDetail(data)
        const normalizedCases = (data.cases || []).map((c, idx) => ({
          ...c,
          id: c.id || `case_${idx + 1}`,
          question: c.question || c.query || c.input || '',
          ground_truth: c.ground_truth || c.expected_output || ''
        }))
        setCases(normalizedCases)
        setIsDirty(false)
      } else {
        toast.error(`读取题库 "${name}" 详情失败`)
      }
    } catch (err) {
      console.error('Failed to fetch dataset detail:', err)
      toast.error('加载题库明细异常')
    } finally {
      setLoadingDetail(false)
    }
  }

  useEffect(() => {
    fetchDatasets()
  }, [currentProjectId])

  useEffect(() => {
    if (selectedDatasetName) {
      fetchDatasetDetail(selectedDatasetName)
    }
  }, [selectedDatasetName])

  // -------------------------------------------------------------------------
  // 3. 在线编辑考题逻辑
  // -------------------------------------------------------------------------
  const handleCaseChange = (index: number, field: 'question' | 'ground_truth', value: string) => {
    setCases((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
    setIsDirty(true)
  }

  const handleDeleteCase = (index: number) => {
    setCases((prev) => prev.filter((_, i) => i !== index))
    setIsDirty(true)
  }

  const handleAddCase = () => {
    const newCase: TestCase = {
      id: `case_${Date.now().toString().slice(-4)}`,
      question: '',
      ground_truth: '',
      context: ['手动录入测试用例']
    }
    setCases((prev) => [newCase, ...prev])
    setIsDirty(true)
    toast.info('已在首行新增一条考题，请编辑后点击保存')
  }

  const handleSaveDataset = async () => {
    if (!selectedDatasetName || !datasetDetail) return
    try {
      setSaving(true)
      const payload = {
        ...datasetDetail,
        cases_count: cases.length,
        cases: cases.map((c) => ({
          question: c.question,
          ground_truth: c.ground_truth,
          context: c.context || c.contexts || []
        }))
      }

      const res = await fetch(`/ops/evaluation/datasets/${encodeURIComponent(selectedDatasetName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        toast.success(`题库 "${selectedDatasetName}" 修改已成功固化到磁盘！`)
        setIsDirty(false)
        fetchDatasets(selectedDatasetName)
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(`保存失败: ${err.detail || '未知错误'}`)
      }
    } catch (err) {
      console.error('Failed to save dataset:', err)
      toast.error('保存评测集网络异常')
    } finally {
      setSaving(false)
    }
  }

  // -------------------------------------------------------------------------
  // 4. 异步自动合成题库轮询
  // -------------------------------------------------------------------------
  const handleTriggerSynthesize = async (e: React.FormEvent) => {
    e.preventDefault()
    const targetName = (
      synthName.trim() || `synth_${currentProjectId}_${Date.now().toString().slice(-4)}`
    ).replace(/[^a-zA-Z0-9_-]/g, '_')

    try {
      setSynthTaskStatus({
        task_id: 'pending',
        type: 'synthesize',
        status: 'running',
        progress: 10,
        message: '正在向调度网关分派考题合成任务...'
      })

      const res = await fetch('/ops/evaluation/datasets/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset_name: targetName,
          test_cases_count: Number(synthCount),
          differential: Boolean(synthCrudDiff)
        })
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(`发起合成任务失败: ${err.detail || '未知错误'}`)
        setSynthTaskStatus(null)
        return
      }

      const { task_id } = await res.json()
      setSynthTaskId(task_id)

      // 开始轮询
      if (synthPollTimer.current) window.clearInterval(synthPollTimer.current)
      synthPollTimer.current = window.setInterval(async () => {
        try {
          const pollRes = await fetch(`/ops/evaluation/tasks/${task_id}`)
          if (pollRes.ok) {
            const task: AsyncTaskStatus = await pollRes.json()
            setSynthTaskStatus(task)

            if (task.status === 'completed') {
              if (synthPollTimer.current) window.clearInterval(synthPollTimer.current)
              toast.success(
                `题库 "${targetName}" 自动合成完成，共计 ${task.result?.cases_count || synthCount} 道考题！`
              )
              await fetchDatasets(targetName)
              setSynthOpen(false)
              setSynthTaskId(null)
              setSynthTaskStatus(null)
            } else if (task.status === 'failed') {
              if (synthPollTimer.current) window.clearInterval(synthPollTimer.current)
              toast.error(`合成任务失败: ${task.error || task.message}`)
            }
          }
        } catch (e) {
          console.warn('Poll task status failed:', e)
        }
      }, 1500)
    } catch (err) {
      console.error('Trigger synthesize failed:', err)
      toast.error('网络异常，无法触发题库合成')
    }
  }

  // -------------------------------------------------------------------------
  // 5. 异步矩阵打擂轮询
  // -------------------------------------------------------------------------
  const handleTriggerMatrix = async (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedModes.length === 0) {
      toast.error('请至少选择一种检索模式进行打擂对比')
      return
    }

    try {
      setMatrixTaskStatus({
        task_id: 'pending',
        type: 'matrix_run',
        status: 'running',
        progress: 10,
        message: '正在初始化评测矩阵沙箱环境...'
      })

      const res = await fetch('/ops/evaluation/matrix-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset_name: selectedDatasetName,
          modes: selectedModes,
          top_k: Number(topK),
          eval_engine: evalEngine
        })
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(`发起矩阵打擂失败: ${err.detail || '未知错误'}`)
        setMatrixTaskStatus(null)
        return
      }

      const { task_id } = await res.json()
      setMatrixTaskId(task_id)

      // 开始轮询
      if (matrixPollTimer.current) window.clearInterval(matrixPollTimer.current)
      matrixPollTimer.current = window.setInterval(async () => {
        try {
          const pollRes = await fetch(`/ops/evaluation/tasks/${task_id}`)
          if (pollRes.ok) {
            const task: AsyncTaskStatus = await pollRes.json()
            setMatrixTaskStatus(task)

            if (task.status === 'completed') {
              if (matrixPollTimer.current) window.clearInterval(matrixPollTimer.current)
              toast.success('矩阵打擂评测已全量完成！指标已封存至 MLflow。')
            } else if (task.status === 'failed') {
              if (matrixPollTimer.current) window.clearInterval(matrixPollTimer.current)
              toast.error(`矩阵打擂执行失败: ${task.error || task.message}`)
            }
          }
        } catch (e) {
          console.warn('Poll matrix task failed:', e)
        }
      }, 1800)
    } catch (err) {
      console.error('Trigger matrix run failed:', err)
      toast.error('网络异常，无法触发矩阵打擂')
    }
  }

  // 清理计时器
  useEffect(() => {
    return () => {
      if (synthPollTimer.current) window.clearInterval(synthPollTimer.current)
      if (matrixPollTimer.current) window.clearInterval(matrixPollTimer.current)
    }
  }, [])

  // 过滤考题
  const filteredCases = useMemo(() => {
    if (!searchQuery.trim()) return cases
    const q = searchQuery.toLowerCase()
    return cases.filter(
      (c) =>
        (c.question && c.question.toLowerCase().includes(q)) ||
        (c.ground_truth && c.ground_truth.toLowerCase().includes(q))
    )
  }, [cases, searchQuery])

  // 题库所属项目友好名称
  const datasetProjectName = useMemo(() => {
    const pid =
      datasetDetail?.corpus_manifest?.project_id ||
      (datasetDetail as any)?.project ||
      (datasetDetail as any)?.project_id
    if (!pid || pid === 'common') return '通用公共'
    const found = workspaceList.find((w) => w.project_id === pid)
    if (found?.name && found.name !== found.project_id) return found.name
    if (pid === '11111111-1111-4111-8111-111111111111') return '平台默认项目'
    if (pid === 'eval_benchmark') return '通用基准'
    return pid.length > 16 ? `${pid.slice(0, 8)}...` : pid
  }, [workspaceList, datasetDetail])

  // 覆盖文档篇数智能计算
  const docCount = useMemo(() => {
    if (
      typeof datasetDetail?.corpus_manifest?.doc_count === 'number' &&
      datasetDetail.corpus_manifest.doc_count > 0
    ) {
      return datasetDetail.corpus_manifest.doc_count
    }
    const uniqueDocs = new Set<string>()
    cases.forEach((c) => {
      const docs = (c as any).source_docs
      if (Array.isArray(docs)) {
        docs.forEach((d) => d && uniqueDocs.add(String(d)))
      }
    })
    return uniqueDocs.size
  }, [datasetDetail, cases])

  // 血缘契约语义判定
  const lineageStatus = useMemo(() => {
    const pid =
      datasetDetail?.corpus_manifest?.project_id ||
      (datasetDetail as any)?.project ||
      (datasetDetail as any)?.project_id
    if (!pid || pid === 'common' || pid === 'eval_benchmark') {
      return {
        type: 'common',
        badge: '🌐 通用公共题库',
        className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
        desc: '属于公共基准问答集，适用于所有知识库'
      }
    }
    if (pid === currentProjectId) {
      return {
        type: 'matched',
        badge: '✅ 本项目题库 (血缘对齐)',
        className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        desc: '考题完全基于当前知识库文档切片提取'
      }
    }
    return {
      type: 'cross',
      badge: `⚠️ 跨项目借调 (${datasetProjectName})`,
      className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      desc: `此题库原本针对【${datasetProjectName}】生成，当前正在跨库复用打擂`
    }
  }, [datasetDetail, currentProjectId, datasetProjectName])

  return (
    <div className="h-full w-full flex flex-col p-4 xl:p-6 space-y-3.5 overflow-hidden bg-background">
      {/* 1. Header & Actions (全宽自适应，无 max-w-6xl 限制) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-border/60 pb-3.5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
            <ActivityIcon className="size-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-foreground">
                评测工坊 (Evaluation Studio)
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-mono font-medium">
                DeepEval 驱动
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              汇总全量测试用例表格 · 在线内联编辑 · 全生命周期差量自动合成 · 嵌入式 MLflow 评测大屏
            </p>
          </div>
        </div>

        {/* 顶部右侧：子视图切换 + 动作按钮 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 切换 Tab：表格视图 vs MLflow 嵌入大屏 */}
          <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border/50 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveSubTab('cases')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer',
                activeSubTab === 'cases'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <TableIcon className="size-3.5" />
              <span>考题表格汇总</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('mlflow')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer',
                activeSubTab === 'mlflow'
                  ? 'bg-background text-foreground shadow-xs text-indigo-600 dark:text-indigo-400'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <BarChart3Icon className="size-3.5" />
              <span>MLflow 评测大屏</span>
            </button>
          </div>

          <div className="h-5 w-px bg-border/60 mx-1 hidden sm:block" />

          {/* 模态框 1 触发：⚡ 自动合成题库 */}
          <Button
            size="sm"
            onClick={() => {
              setSynthName(
                `synth_${currentProjectId}_${new Date().toISOString().slice(5, 10).replace('-', '')}`
              )
              setSynthOpen(true)
            }}
            className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 text-xs shadow-xs"
          >
            <SparklesIcon className="size-3.5" />
            <span>自动合成题库</span>
          </Button>

          {/* 模态框 2 触发：⚔️ 矩阵打擂 */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMatrixOpen(true)}
            disabled={!datasetDetail || cases.length === 0}
            className="h-8 border-indigo-500/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 gap-1.5 text-xs"
          >
            <SwordsIcon className="size-3.5" />
            <span>矩阵参数打擂</span>
          </Button>

          {/* 新窗口直达 MLflow 外部链接 */}
          <a
            href={mlflowUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/80 border border-border/50 transition-colors"
            title="在新标签页独立打开 MLflow"
          >
            <span>新窗口</span>
            <ArrowUpRightIcon className="size-3.5" />
          </a>
        </div>
      </div>

      {/* 2. 核心内容区域：按 activeSubTab 渲染 */}
      {activeSubTab === 'mlflow' ? (
        /* ----------------------------------------------------------------- */
        /* 视图 B：嵌入式 MLflow 评测大屏 */
        /* ----------------------------------------------------------------- */
        <div className="flex-1 flex flex-col min-h-0 rounded-xl border border-border/60 bg-card/60 overflow-hidden shadow-xs">
          {/* iframe 工具栏 */}
          <div className="h-10 px-4 border-b border-border/60 bg-muted/30 flex items-center justify-between text-xs shrink-0">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold text-foreground">
                MLflow 实验追踪与评估看板
              </span>
              <span className="text-[11px] font-mono text-muted-foreground hidden lg:inline">
                ({mlflowUrl})
              </span>
            </div>

            <div className="flex items-center gap-2">
              {showUrlConfig ? (
                <div className="flex items-center gap-1 bg-background p-1 rounded-md border border-border/80">
                  <input
                    type="text"
                    value={tempMlflowUrl}
                    onChange={(e) => setTempMlflowUrl(e.target.value)}
                    placeholder="http://..."
                    className="h-6 px-2 text-[11px] font-mono rounded bg-muted/40 border-0 focus:outline-none w-56"
                  />
                  <Button
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => {
                      setMlflowUrl(tempMlflowUrl.trim())
                      localStorage.setItem('omnirag_eval_mlflow_url', tempMlflowUrl.trim())
                      setShowUrlConfig(false)
                      setIframeKey((k) => k + 1)
                      toast.success('MLflow 平台地址已更新')
                    }}
                  >
                    保存
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-[10px]"
                    onClick={() => {
                      setTempMlflowUrl(mlflowUrl)
                      setShowUrlConfig(false)
                    }}
                  >
                    取消
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowUrlConfig(true)}
                  className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                  title="配置 MLflow 接入地址"
                >
                  <Settings2Icon className="size-3" />
                  <span>配置地址</span>
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIframeKey((k) => k + 1)}
                className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
              >
                <RefreshCwIcon className="size-3" />
                <span>刷新大屏</span>
              </Button>
              <a
                href={mlflowUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline px-2"
              >
                <span>独立窗口打开</span>
                <ExternalLinkIcon className="size-3" />
              </a>
            </div>
          </div>

          {/* iframe 视图 */}
          <div className="flex-1 w-full h-full min-h-0 bg-background relative">
            <iframe
              key={iframeKey}
              src={mlflowUrl}
              title="MLflow Evaluation Platform"
              className="w-full h-full border-0 absolute inset-0"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            />
          </div>
        </div>
      ) : (
        /* ----------------------------------------------------------------- */
        /* 视图 A：考题全量数据表格汇总 (Table Grid) */
        /* ----------------------------------------------------------------- */
        <div className="flex-1 flex flex-col min-h-0 space-y-3 overflow-hidden">
          {/* 题库血缘与操作状态条 (全宽自适应) */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/25 px-3.5 py-2.5 rounded-lg border border-border/50 shrink-0 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              {/* 题库选择下拉框 */}
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground font-medium">当前评测集:</span>
                <select
                  value={selectedDatasetName}
                  onChange={(e) => setSelectedDatasetName(e.target.value)}
                  disabled={loadingDatasets}
                  className="text-xs h-7 pl-2.5 pr-7 rounded-md bg-background text-foreground border border-border/80 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium cursor-pointer"
                >
                  {datasets.length === 0 ? (
                    <option value="">暂无评测题库</option>
                  ) : (
                    datasets.map((d) => (
                      <option key={d.name} value={d.name}>
                        {d.name} ({d.cases_count} 题)
                      </option>
                    ))
                  )}
                </select>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fetchDatasets(selectedDatasetName)}
                  disabled={loadingDatasets}
                  className="size-7 p-0"
                  tooltip="刷新题库"
                >
                  <RefreshCwIcon className={cn('size-3', loadingDatasets && 'animate-spin')} />
                </Button>
              </div>

              <div className="h-4 w-px bg-border/60 hidden sm:block" />

              {/* 知识库与血缘契约简要信息 */}
              <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-muted-foreground">
                <span
                  className="flex items-center gap-1"
                  title={`当前激活知识库: ${currentProjectName} (${currentProjectId})`}
                >
                  <FolderGit2Icon className="size-3 text-indigo-500" />
                  <span>知识库:</span>
                  <strong className="text-foreground font-medium">
                    {currentProjectName}
                  </strong>
                </span>

                <span className="flex items-center gap-1">
                  <LayersIcon className="size-3" />
                  <span>基线:</span>
                  <span className="font-mono text-foreground">
                    {datasetDetail?.corpus_manifest?.revision || 'rev_1'}
                  </span>
                </span>

                <span className="flex items-center gap-1">
                  <FileTextIcon className="size-3" />
                  <span>覆盖文档:</span>
                  <strong className="text-foreground">
                    {docCount > 0 ? `${docCount} 篇` : '手工编制'}
                  </strong>
                </span>

                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors cursor-help',
                    lineageStatus.className
                  )}
                  title={lineageStatus.desc}
                >
                  <span>{lineageStatus.badge}</span>
                </span>
              </div>
            </div>

            {/* 表格操作：搜索过滤 + 新增题目 + 保存 */}
            <div className="flex items-center gap-2 ml-auto">
              <div className="relative w-48 sm:w-64">
                <SearchIcon className="size-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="搜索问题或答案关键词..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-1 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleAddCase}
                className="h-7 gap-1 text-xs px-2.5"
              >
                <PlusIcon className="size-3" />
                <span>添加考题</span>
              </Button>

              <Button
                size="sm"
                onClick={handleSaveDataset}
                disabled={!isDirty || saving}
                className={cn(
                  'h-7 gap-1 text-xs px-3 transition-all',
                  isDirty
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-semibold'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {saving ? (
                  <Loader2Icon className="size-3 animate-spin" />
                ) : (
                  <SaveIcon className="size-3" />
                )}
                <span>{isDirty ? '保存修改至磁盘' : '修改已保存'}</span>
              </Button>
            </div>
          </div>

          {/* 3. 汇总数据表格 (Full-width Data Table) */}
          <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-border/60 bg-card/60 shadow-xs relative">
            {loadingDetail ? (
              <div className="h-64 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2Icon className="size-6 animate-spin text-indigo-500" />
                <span>正在载入评测用例数据...</span>
              </div>
            ) : filteredCases.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center gap-2 text-center p-6">
                <FileTextIcon className="size-8 text-muted-foreground/60" />
                <p className="text-xs font-semibold text-foreground">暂无符合条件的考题用例</p>
                <p className="text-[11px] text-muted-foreground max-w-sm">
                  您可以尝试清空搜索条件，或者点击右上角“自动合成题库”/“添加考题”。
                </p>
              </div>
            ) : (
              <Table className="w-full text-xs">
                <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-xs z-10 border-b border-border/80">
                  <TableRow className="hover:bg-transparent text-muted-foreground font-semibold">
                    <TableHead className="w-14 text-center py-2.5">#</TableHead>
                    <TableHead className="w-28 py-2.5">用例标识</TableHead>
                    <TableHead className="w-[38%] py-2.5">提问问题 (Question / Query)</TableHead>
                    <TableHead className="w-[38%] py-2.5">标准黄金答案 (Ground Truth)</TableHead>
                    <TableHead className="w-32 py-2.5">支撑上下文</TableHead>
                    <TableHead className="w-20 text-right pr-4 py-2.5">操作</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody className="divide-y divide-border/30">
                  {filteredCases.map((c, index) => (
                    <TableRow
                      key={c.id || index}
                      className="group hover:bg-muted/40 transition-colors align-top"
                    >
                      {/* 1. 序号 */}
                      <TableCell className="text-center font-mono py-3 text-muted-foreground font-semibold">
                        <span className="inline-block size-6 rounded bg-muted/60 text-center leading-6 text-[11px]">
                          {index + 1}
                        </span>
                      </TableCell>

                      {/* 2. 用例标识 & 进化类型 */}
                      <TableCell className="py-3">
                        <div className="space-y-1">
                          <span className="font-mono text-xs font-medium text-foreground block truncate">
                            {c.id || `case_${index + 1}`}
                          </span>
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                            {c.metadata?.evolution_type || 'DeepEval'}
                          </span>
                        </div>
                      </TableCell>

                      {/* 3. 提问问题 (Question) 可直接内联编辑 */}
                      <TableCell className="py-2.5">
                        <textarea
                          value={c.question || ''}
                          onChange={(e) => handleCaseChange(index, 'question', e.target.value)}
                          rows={2}
                          placeholder="输入提问内容..."
                          className="w-full text-xs font-medium p-2 rounded-md border border-border/50 bg-background/50 hover:bg-background focus:bg-background focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y transition-colors leading-relaxed"
                        />
                      </TableCell>

                      {/* 4. 标准黄金答案 (Ground Truth) 可直接内联编辑 */}
                      <TableCell className="py-2.5">
                        <textarea
                          value={c.ground_truth || ''}
                          onChange={(e) => handleCaseChange(index, 'ground_truth', e.target.value)}
                          rows={2}
                          placeholder="输入黄金标准答案..."
                          className="w-full text-xs font-mono p-2 rounded-md border border-border/50 bg-background/50 hover:bg-background focus:bg-background focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-y transition-colors leading-relaxed text-emerald-700 dark:text-emerald-300"
                        />
                      </TableCell>

                      {/* 5. 支撑上下文片段 */}
                      <TableCell className="py-2.5 text-[11px] text-muted-foreground">
                        {(() => {
                          const ctxs = getCaseContexts(c)
                          if (ctxs.length > 0) {
                            const totalChars = ctxs.reduce((sum, item) => sum + item.length, 0)
                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  setInspectCase(c)
                                  setEditingContextText(ctxs.join('\n\n---\n\n'))
                                  setIsEditingContext(false)
                                }}
                                className="text-left font-mono hover:text-foreground text-[10px] bg-emerald-500/5 hover:bg-emerald-500/10 p-2 rounded-md border border-emerald-500/20 hover:border-emerald-500/40 transition-colors cursor-pointer w-full group/ctx flex flex-col gap-1 text-left"
                                title="点击查看完整支撑切片与来源文档"
                              >
                                <div className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
                                  <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
                                  <span>{ctxs.length} 个切片证据</span>
                                  <span className="text-[9px] text-muted-foreground font-normal">
                                    ({totalChars} 字)
                                  </span>
                                </div>
                                <div className="line-clamp-2 text-foreground/80 text-[10px] leading-relaxed break-all">
                                  {ctxs[0]}
                                </div>
                              </button>
                            )
                          }
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                setInspectCase(c)
                                setEditingContextText('')
                                setIsEditingContext(true)
                              }}
                              className="text-left font-mono text-[10px] text-muted-foreground/70 hover:text-indigo-600 dark:hover:text-indigo-400 bg-muted/20 hover:bg-indigo-500/5 p-2 rounded-md border border-dashed border-border/60 hover:border-indigo-500/40 transition-colors w-full flex items-center justify-between cursor-pointer"
                              title="该考题暂无切片证据，点击可手动补充录入"
                            >
                              <span>未关联切片 (手工用例)</span>
                              <span className="text-[10px] text-indigo-500 font-semibold hover:underline">
                                + 补充
                              </span>
                            </button>
                          )
                        })()}
                      </TableCell>

                      {/* 6. 操作按钮 */}
                      <TableCell className="text-right pr-4 py-3">
                        <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => {
                              setInspectCase(c)
                              const ctxs = getCaseContexts(c)
                              setEditingContextText(ctxs.join('\n\n---\n\n'))
                              setIsEditingContext(false)
                            }}
                            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                            title="检视完整考题用例"
                          >
                            <Maximize2Icon className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCase(index)}
                            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                            title="删除该考题"
                          >
                            <Trash2Icon className="size-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* 表格底部汇总信息 */}
          <div className="flex items-center justify-between text-xs text-muted-foreground px-2 pt-1 shrink-0">
            <span>
              已汇总展示 <strong className="text-foreground">{filteredCases.length}</strong> 道测试考题
              {filteredCases.length !== cases.length && ` (题库总计 ${cases.length} 道)`}
            </span>

            {isDirty && (
              <span className="inline-flex items-center gap-1.5 text-amber-500 font-medium text-[11px] animate-pulse">
                <span className="size-1.5 rounded-full bg-amber-500" />
                <span>存在未保存更改，请点击右上角保存修改</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 模态框 0：单题详情完整检视 (Inspect Case Modal) */}
      {/* ------------------------------------------------------------------- */}
      <Dialog open={Boolean(inspectCase)} onOpenChange={(open) => !open && setInspectCase(null)}>
        <DialogContent className="sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileTextIcon className="size-4 text-indigo-500" />
              <span>考题用例检视 ({inspectCase?.id})</span>
            </DialogTitle>
            <DialogDescription>
              检视考题的完整提问、标准黄金答案以及底层提取的支撑上下文证据。
            </DialogDescription>
          </DialogHeader>

          {inspectCase && (() => {
            const ctxs = getCaseContexts(inspectCase)
            const sourceDocs: string[] = (inspectCase as any).source_docs || []
            return (
              <div className="space-y-3.5 py-2 text-xs">
                {/* 1. 提问内容 */}
                <div className="space-y-1">
                  <label className="font-semibold text-muted-foreground uppercase text-[11px]">
                    提问内容 (Question)
                  </label>
                  <div className="p-3 rounded-lg bg-muted/40 font-medium text-foreground leading-relaxed border border-border/50">
                    {inspectCase.question}
                  </div>
                </div>

                {/* 2. 黄金标准答案 */}
                <div className="space-y-1">
                  <label className="font-semibold text-emerald-600 dark:text-emerald-400 uppercase text-[11px]">
                    黄金标准答案 (Ground Truth)
                  </label>
                  <div className="p-3 rounded-lg bg-emerald-500/5 font-mono text-foreground leading-relaxed border border-emerald-500/20">
                    {inspectCase.ground_truth}
                  </div>
                </div>

                {/* 3. 支撑上下文与出处证据 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-muted-foreground uppercase text-[11px] flex items-center gap-1.5">
                      <span>支撑上下文与切片证据 (Contexts & Sources)</span>
                      {ctxs.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-600 font-mono">
                          {ctxs.length} 个切片
                        </span>
                      )}
                    </label>
                    <div className="flex items-center gap-2">
                      {sourceDocs.length > 0 && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          来源: {sourceDocs.join(', ')}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsEditingContext(!isEditingContext)}
                        className="h-6 px-1.5 text-[10px] gap-1 text-indigo-600 dark:text-indigo-400"
                      >
                        <Edit3Icon className="size-3" />
                        <span>{isEditingContext ? '取消编辑' : '在线编辑切片'}</span>
                      </Button>
                    </div>
                  </div>

                  {isEditingContext ? (
                    <div className="space-y-1.5">
                      <textarea
                        value={editingContextText}
                        onChange={(e) => setEditingContextText(e.target.value)}
                        rows={6}
                        placeholder="在此粘贴或输入该考题的底层支撑切片内容..."
                        className="w-full text-xs font-mono p-2.5 rounded-lg border border-indigo-500/50 bg-background focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed resize-y"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                          onClick={() => {
                            const trimmed = editingContextText.trim()
                            const newContexts = trimmed ? [trimmed] : []
                            const updatedCase: TestCase = {
                              ...inspectCase,
                              contexts: newContexts,
                              context: trimmed
                            }
                            setInspectCase(updatedCase)
                            setCases((prev) =>
                              prev.map((item) =>
                                (item.id && item.id === inspectCase.id) ||
                                (item.test_number && item.test_number === inspectCase.test_number) ||
                                (item.question === inspectCase.question)
                                  ? updatedCase
                                  : item
                              )
                            )
                            setIsDirty(true)
                            setIsEditingContext(false)
                            toast.success('支撑切片已更新！请记得点击右上角保存持久化回盘')
                          }}
                        >
                          确认并应用切片
                        </Button>
                      </div>
                    </div>
                  ) : ctxs.length > 0 ? (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {ctxs.map((ctxText, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-md bg-muted/30 font-mono text-[11px] text-foreground/90 leading-relaxed border border-border/40 whitespace-pre-wrap select-text"
                        >
                          <div className="text-[10px] font-semibold text-indigo-500 mb-1 flex items-center justify-between">
                            <span>切片 #{idx + 1}</span>
                            <span className="text-muted-foreground font-normal">{ctxText.length} 字符</span>
                          </div>
                          {ctxText}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-lg bg-amber-500/5 border border-amber-500/20 text-muted-foreground text-xs space-y-1.5">
                      <div className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400 text-xs">
                        <AlertCircleIcon className="size-4 shrink-0" />
                        <span>当前考题未关联底层知识切片 (手工录入基准)</span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        此题属于轻量问答样本。点击上方<b>「在线编辑切片」</b>可立即补充上下文证据；或使用顶部的<b>「自动合成题库」</b>，系统将自动从文档向量与图谱中提取段落切片作为评测依据。
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          <DialogFooter className="pt-2">
            <Button size="sm" onClick={() => setInspectCase(null)}>
              关闭检视
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------------- */}
      {/* 模态框 1：⚡ 自动合成题库 (DeepEval Synthesizer) */}
      {/* ------------------------------------------------------------------- */}
      <Dialog open={synthOpen} onOpenChange={setSynthOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SparklesIcon className="size-4 text-indigo-500" />
              <span>自动合成评测题库 (DeepEval Synthesizer)</span>
            </DialogTitle>
            <DialogDescription>
              基于当前项目入库的物理文档，利用大模型自动提取实体关系与核心论据，进化合成问答对。
            </DialogDescription>
          </DialogHeader>

          {synthTaskStatus && synthTaskStatus.status === 'running' ? (
            <div className="py-6 space-y-4 text-center">
              <div className="size-12 rounded-full bg-indigo-500/10 text-indigo-500 flex items-center justify-center mx-auto">
                <Loader2Icon className="size-6 animate-spin" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">正在合成评测题库中...</p>
                <p className="text-xs text-muted-foreground font-mono">
                  {synthTaskStatus.message}
                </p>
              </div>
              <Progress value={synthTaskStatus.progress || 35} className="h-1.5" />
              <p className="text-[10px] text-muted-foreground">
                任务正在后台安全运行，请耐心等待调度器生成...
              </p>
            </div>
          ) : (
            <form onSubmit={handleTriggerSynthesize} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  题库命名 (Dataset Name) *
                </label>
                <input
                  type="text"
                  placeholder="例如：synth_benchmark_v1"
                  value={synthName}
                  onChange={(e) => setSynthName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">计划生成考题数量</label>
                  <span className="font-mono text-xs font-bold text-indigo-500">
                    {synthCount} 题
                  </span>
                </div>
                <input
                  type="range"
                  min={3}
                  max={25}
                  step={1}
                  value={synthCount}
                  onChange={(e) => setSynthCount(Number(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                  <span>3 (极速预览)</span>
                  <span>10 (标准基准)</span>
                  <span>25 (全量高精)</span>
                </div>
              </div>

              {/* 全生命周期增删改差量探测开关 */}
              <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3 space-y-2">
                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="crud-diff-checkbox-table"
                    checked={synthCrudDiff}
                    onChange={(e) => setSynthCrudDiff(e.target.checked)}
                    className="mt-0.5 rounded border-indigo-500 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <div className="space-y-0.5">
                    <label
                      htmlFor="crud-diff-checkbox-table"
                      className="text-xs font-semibold text-foreground cursor-pointer"
                    >
                      开启全生命周期增删改差量探测 (CRUD Differential Mode)
                    </label>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      智能对比当前文档集合与历史指纹：只针对<strong>新增或更新文档</strong>
                      定向合成考题；对于<strong>已删除文档</strong>
                      关联考题自动执行修剪，杜绝无效全量重算。
                    </p>
                  </div>
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSynthOpen(false)}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  开始合成题库
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------------- */}
      {/* 模态框 2：⚔️ 多参数矩阵打擂 (Matrix Battle) */}
      {/* ------------------------------------------------------------------- */}
      <Dialog open={matrixOpen} onOpenChange={setMatrixOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SwordsIcon className="size-4 text-indigo-500" />
              <span>多参数矩阵打擂 (Matrix Battle Console)</span>
            </DialogTitle>
            <DialogDescription>
              基于选定题库并发比对不同检索策略（纯向量 vs 混合 vs 图谱融合），指标直通 MLflow。
            </DialogDescription>
          </DialogHeader>

          {matrixTaskStatus && matrixTaskStatus.status === 'running' ? (
            <div className="py-6 space-y-4 text-center">
              <div className="size-12 rounded-full bg-indigo-500/10 text-indigo-500 flex items-center justify-center mx-auto">
                <Loader2Icon className="size-6 animate-spin" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">矩阵打擂正在并发评估中...</p>
                <p className="text-xs text-muted-foreground font-mono">
                  {matrixTaskStatus.message}
                </p>
              </div>
              <Progress value={matrixTaskStatus.progress || 40} className="h-1.5" />
              <p className="text-[10px] text-muted-foreground">
                正在执行 DeepEval G-Eval、Faithfulness 及 Relevancy 判定...
              </p>
            </div>
          ) : matrixTaskStatus && matrixTaskStatus.status === 'completed' ? (
            <div className="py-4 space-y-4">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-center space-y-2">
                <CheckCircle2Icon className="size-8 text-emerald-500 mx-auto" />
                <h4 className="text-sm font-semibold text-foreground">打擂评估已圆满完成！</h4>
                <p className="text-xs text-muted-foreground">
                  评测指标、详细打分及问答轨迹已完整同步至 MLflow 实验平台。
                </p>
              </div>

              <div className="flex flex-wrap justify-center gap-2 pt-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setMatrixOpen(false)
                    setActiveSubTab('mlflow')
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                >
                  <BarChart3Icon className="size-3.5 mr-1" />
                  <span>切换至嵌入评测大屏</span>
                </Button>
                <a
                  href={mlflowUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border/80 bg-background hover:bg-muted text-foreground text-xs font-semibold"
                >
                  <span>新窗口打开 MLflow</span>
                  <ExternalLinkIcon className="size-3.5" />
                </a>
              </div>
            </div>
          ) : (
            <form onSubmit={handleTriggerMatrix} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">当前参评题库</label>
                <div className="w-full px-3 py-1.5 text-xs font-mono rounded-md bg-muted text-foreground border border-input">
                  {selectedDatasetName} ({cases.length} 道考题)
                </div>
              </div>

              {/* 模式选择 */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  参赛检索模式 (并发打擂)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'mix', name: 'Mix 融合', desc: '图谱知识+向量混合多路召回' },
                    { id: 'hybrid', name: 'Hybrid 混合', desc: '全局/局部关系图融合' },
                    { id: 'naive', name: 'Naive 纯向量', desc: '标准语义嵌入余弦比对' },
                    { id: 'local', name: 'Local 局部', desc: '实体一度相邻子图抽取' }
                  ].map((m) => {
                    const checked = selectedModes.includes(m.id)
                    return (
                      <div
                        key={m.id}
                        onClick={() => {
                          setSelectedModes((prev) =>
                            checked ? prev.filter((x) => x !== m.id) : [...prev, m.id]
                          )
                        }}
                        className={cn(
                          'p-2.5 rounded-lg border text-left cursor-pointer transition-all',
                          checked
                            ? 'border-indigo-500 bg-indigo-500/10 text-foreground font-medium'
                            : 'border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/60'
                        )}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span>{m.name}</span>
                          <input
                            type="checkbox"
                            checked={checked}
                            readOnly
                            className="size-3 accent-indigo-500"
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">
                          {m.desc}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Top-K */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">
                    检索召回限制 (Top-K)
                  </label>
                  <span className="font-mono text-xs font-bold text-indigo-500">{topK}</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={120}
                  step={10}
                  value={topK}
                  onChange={(e) => setTopK(Number(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMatrixOpen(false)}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={selectedModes.length === 0}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  启动矩阵打擂流水线
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
