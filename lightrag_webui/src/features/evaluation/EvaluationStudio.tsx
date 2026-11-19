import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react'
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
  AlertCircleIcon,
  CopyIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorkspaceStore } from '@/stores/workspace'
import { toast } from 'sonner'
import EvaluationTaskCenter from './EvaluationTaskCenter'
import Button from '@/components/ui/Button'

// 动态惰性加载全景资产子大屏，避免膨胀首屏 bundle 体积
const DatasetPanoramaView = React.lazy(() => import('./DatasetPanoramaView'))
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
  logs?: string[]
  result_url?: string
  runs?: string[]
  result?: any
  error?: string
}

interface ReadinessReport {
  status: 'ready' | 'partial' | 'missing' | 'unknown'
  dataset_name: string
  project_id: string
  target_project_id?: string
  target_tenant_id?: string
  target_project_name?: string
  is_mismatched?: boolean
  is_benchmark?: boolean
  coverage_rate: number
  total_required: number
  matched_docs: string[]
  missing_docs: string[]
  total_project_docs: number
  message: string
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

  // 顶层子视图切换：'panorama' (题库全景与关系) | 'cases' (考题表格与打擂) | 'tasks' (打擂任务大厅) | 'mlflow' (内嵌评测大屏)
  type SubTabType = 'panorama' | 'cases' | 'tasks' | 'mlflow'
  const [activeSubTab, setActiveSubTab] = useState<SubTabType>(() => {
    try {
      const saved = localStorage.getItem('eval_studio_active_subtab')
      if (saved && ['panorama', 'cases', 'tasks', 'mlflow'].includes(saved)) {
        return saved as SubTabType
      }
    } catch {
      // ignore
    }
    return 'panorama'
  })

  const handleSubTabChange = (tab: SubTabType) => {
    setActiveSubTab(tab)
    try {
      localStorage.setItem('eval_studio_active_subtab', tab)
    } catch {
      // ignore
    }
  }

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
  const [deletingDataset, setDeletingDataset] = useState(false)

  // 原材料就绪度检测状态 (Readiness Guard)
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null)
  const [checkingReadiness, setCheckingReadiness] = useState(false)

  // 从全景视图跳转到打擂现场
  const handleNavigateToBattle = async (
    datasetName: string,
    targetProjectId: string,
    targetTenantId?: string
  ) => {
    try {
      // 1. 如果题库归属非全局且与当前激活知识库不一致，自动对齐切库
      if (
        targetProjectId &&
        targetProjectId !== 'all' &&
        targetProjectId !== currentProjectId
      ) {
        const tId = targetTenantId || currentTenantId || '__default'
        const res = await fetch('/ops/workspaces/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant_id: tId,
            project_id: targetProjectId
          })
        })
        if (res.ok) {
          useWorkspaceStore.getState().setCurrentWorkspace(tId, targetProjectId)
          toast.success(`已自动对齐切换至归属知识库「${targetProjectId}」！`)
        } else {
          console.warn('Auto switch workspace returned non-ok status')
        }
      }

      // 2. 预置当前选中的评测集
      setSelectedDatasetName(datasetName)
      await fetchDatasetDetail(datasetName)
      await fetchReadiness(datasetName, targetProjectId !== 'all' ? targetProjectId : currentProjectId)

      // 3. 切换 SubTab 到 'cases' (矩阵打擂台)
      handleSubTabChange('cases')
    } catch (err) {
      console.error('Failed to navigate to battle:', err)
      toast.error('跳转打擂现场失败')
    }
  }

  // 手动快速切库（用于契约拦截横幅上的脱困按钮）
  const handleQuickSwitchProject = async (targetProjectId: string, targetTenantId?: string) => {
    try {
      const tId = targetTenantId || currentTenantId || '__default'
      const res = await fetch('/ops/workspaces/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tId,
          project_id: targetProjectId
        })
      })
      if (res.ok) {
        useWorkspaceStore.getState().setCurrentWorkspace(tId, targetProjectId)
        toast.success(`已成功切换至知识库「${targetProjectId}」！`)
        if (selectedDatasetName) {
          await fetchReadiness(selectedDatasetName, targetProjectId)
        }
      } else {
        toast.error('切换知识库失败')
      }
    } catch (err) {
      toast.error(`切换知识库异常: ${err}`)
    }
  }

  // 考题在线编辑与脏状态
  const [cases, setCases] = useState<TestCase[]>([])
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // 单题详情检视模态框与上下文在线编辑
  const [inspectCase, setInspectCase] = useState<TestCase | null>(null)
  const [editingContextText, setEditingContextText] = useState<string>('')
  const [isEditingContext, setIsEditingContext] = useState<boolean>(false)
  const [focusSlice, setFocusSlice] = useState<{ index: number; text: string; caseId?: string | number } | null>(null)

  // 模态框 1：自动合成考题
  const [synthOpen, setSynthOpen] = useState(false)
  const [synthName, setSynthName] = useState('')
  const [synthCount, setSynthCount] = useState<number>(5)
  const [synthCrudDiff, setSynthCrudDiff] = useState(true)
  const [synthTargetMode, setSynthTargetMode] = useState<'overwrite' | 'create'>('overwrite')
  const [synthTaskId, setSynthTaskId] = useState<string | null>(null)
  const [synthTaskStatus, setSynthTaskStatus] = useState<AsyncTaskStatus | null>(null)

  // 模态框 2：多参数矩阵打擂
  const [matrixOpen, setMatrixOpen] = useState(false)
  const [selectedModes, setSelectedModes] = useState<string[]>(['mix', 'hybrid'])
  const [topK, setTopK] = useState<number>(60)
  const [evalEngine, setEvalEngine] = useState<string>('deepeval')
  const [matrixTaskId, setMatrixTaskId] = useState<string | null>(null)
  const [matrixTaskStatus, setMatrixTaskStatus] = useState<AsyncTaskStatus | null>(null)
  const [matrixLimitMode, setMatrixLimitMode] = useState<'quick' | 'full'>('quick')

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

  // 题库智能血缘分组（专属题库 / 平台通用基准 / 其他项目）
  const { projectDatasets, benchmarkDatasets, otherDatasets } = useMemo(() => {
    const proj: DatasetSummary[] = []
    const bench: DatasetSummary[] = []
    const other: DatasetSummary[] = []

    datasets.forEach((d) => {
      const isBenchmark =
        d.name.toLowerCase().includes('benchmark') ||
        d.name === 'business_qa.json' ||
        d.project_id === 'eval_benchmark' ||
        d.project_id === '11111111-1111-4111-8111-111111111111'

      const isCurrentProject =
        Boolean(currentProjectId) &&
        (d.project_id === currentProjectId ||
          (currentProjectId.length >= 8 && d.name.includes(currentProjectId.slice(0, 8))))

      if (isCurrentProject) {
        proj.push(d)
      } else if (isBenchmark) {
        bench.push(d)
      } else {
        other.push(d)
      }
    })

    return { projectDatasets: proj, benchmarkDatasets: bench, otherDatasets: other }
  }, [datasets, currentProjectId])

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

  // -------------------------------------------------------------------------
  // 2.1 原材料就绪度检测 (Readiness Guard)
  // -------------------------------------------------------------------------
  const fetchReadiness = async (datasetName: string, projId?: string) => {
    if (!datasetName) {
      setReadiness(null)
      return
    }
    try {
      setCheckingReadiness(true)
      const targetProj = projId || currentProjectId || ''
      const url = `/ops/evaluation/datasets/${encodeURIComponent(datasetName)}/readiness?project_id=${encodeURIComponent(targetProj)}`
      const res = await fetch(url)
      if (res.ok) {
        const data: ReadinessReport = await res.json()
        setReadiness(data)
      } else {
        setReadiness(null)
      }
    } catch (err) {
      console.error('Failed to fetch evaluation readiness:', err)
      setReadiness(null)
    } finally {
      setCheckingReadiness(false)
    }
  }

  // -------------------------------------------------------------------------
  // 2.2 题库安全删除与归档 (Lifecycle Trash)
  // -------------------------------------------------------------------------
  const handleDeleteDataset = async () => {
    if (!selectedDatasetName) return
    if (selectedDatasetName === 'business_qa.json' || selectedDatasetName === 'sample_lightrag.json') {
      toast.error('基准题库为系统级资产，受保护禁止删除！')
      return
    }
    const confirmed = window.confirm(
      `⚠️ 确定要将题库 "${selectedDatasetName}" 移入回收站归档吗？\n该操作会将其安全移入 .trash 目录，不影响历史评测记录。`
    )
    if (!confirmed) return

    try {
      setDeletingDataset(true)
      const res = await fetch(`/ops/evaluation/datasets/${encodeURIComponent(selectedDatasetName)}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        toast.success(`题库 "${selectedDatasetName}" 已成功移入回收站！`)
        await fetchDatasets()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(`删除失败: ${err.detail || '未知错误'}`)
      }
    } catch (err) {
      toast.error(`删除题库请求失败: ${err}`)
    } finally {
      setDeletingDataset(false)
    }
  }

  useEffect(() => {
    fetchDatasets()
  }, [currentProjectId])

  useEffect(() => {
    if (selectedDatasetName) {
      fetchDatasetDetail(selectedDatasetName)
      fetchReadiness(selectedDatasetName, currentProjectId)
    } else {
      setReadiness(null)
    }
  }, [selectedDatasetName, currentProjectId])

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
    const rawTargetName =
      synthTargetMode === 'overwrite' && selectedDatasetName
        ? selectedDatasetName
        : (synthName.trim() || `synth_${currentProjectId}_${Date.now().toString().slice(-4)}`)
    const targetName = rawTargetName.endsWith('.json') ? rawTargetName : `${rawTargetName}.json`

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
          project_id: currentProjectId,
          output_name: targetName,
          size: Number(synthCount),
          incremental: Boolean(synthCrudDiff),
          base_dataset: selectedDatasetName || undefined
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
          project_id: currentProjectId,
          dataset: selectedDatasetName,
          matrix_mode: selectedModes,
          top_k: Number(topK),
          limit: matrixLimitMode === 'quick' ? 5 : null,
          eval_engine: evalEngine,
          mlflow: true
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
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-border/60 pb-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-9 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
            <ActivityIcon className="size-5 animate-pulse" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-foreground truncate">
                评测工坊 (Evaluation Studio)
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-mono font-medium shrink-0">
                DeepEval 驱动
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate max-w-xl">
              汇总全量测试用例表格 · 在线内联编辑 · 全生命周期差量自动合成 · 嵌入式 MLflow 评测大屏
            </p>
          </div>
        </div>

        {/* 顶部右侧：子视图切换 + 动作按钮 (响应式分组排版，杜绝断崖式单独折行) */}
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between xl:justify-end gap-2 shrink-0">
          {/* 切换 Tab：全景资产 vs 表格打擂 vs 打擂任务大厅 vs MLflow 嵌入大屏 */}
          <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border/50 text-xs font-medium shrink-0">
            <button
              type="button"
              onClick={() => handleSubTabChange('panorama')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md transition-all cursor-pointer whitespace-nowrap',
                activeSubTab === 'panorama'
                  ? 'bg-background text-foreground shadow-xs text-indigo-600 dark:text-indigo-400 font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <LayersIcon className="size-3.5 text-indigo-500" />
              <span>题库资产全景</span>
            </button>
            <button
              type="button"
              onClick={() => handleSubTabChange('cases')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md transition-all cursor-pointer whitespace-nowrap',
                activeSubTab === 'cases'
                  ? 'bg-background text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <TableIcon className="size-3.5" />
              <span>考题表格汇总</span>
            </button>
            <button
              type="button"
              onClick={() => handleSubTabChange('tasks')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md transition-all cursor-pointer relative whitespace-nowrap',
                activeSubTab === 'tasks'
                  ? 'bg-background text-foreground shadow-xs text-indigo-600 dark:text-indigo-400 font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <SwordsIcon className="size-3.5 text-indigo-500" />
              <span>打擂任务大厅</span>
              {matrixTaskStatus && matrixTaskStatus.status === 'running' && (
                <span className="size-2 rounded-full bg-amber-500 animate-ping absolute -top-0.5 -right-0.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => handleSubTabChange('mlflow')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md transition-all cursor-pointer whitespace-nowrap',
                activeSubTab === 'mlflow'
                  ? 'bg-background text-foreground shadow-xs text-indigo-600 dark:text-indigo-400 font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <BarChart3Icon className="size-3.5" />
              <span>MLflow 评测大屏</span>
            </button>
          </div>

          <div className="h-5 w-px bg-border/60 hidden md:block shrink-0" />

          {/* 模态框动作组（自动合成、矩阵打擂、新窗口）紧凑并列 */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              onClick={() => {
                if (
                  selectedDatasetName &&
                  (projectDatasets.some((d) => d.name === selectedDatasetName) ||
                    selectedDatasetName.startsWith('lineage_') ||
                    selectedDatasetName.startsWith('synth_'))
                ) {
                  setSynthTargetMode('overwrite')
                  setSynthName(selectedDatasetName)
                } else {
                  setSynthTargetMode('create')
                  const prefix = currentProjectId ? currentProjectId.slice(0, 8) : 'custom'
                  setSynthName(`${prefix}_synth_${new Date().toISOString().slice(5, 10).replace('-', '')}.json`)
                }
                setSynthOpen(true)
              }}
              className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 text-xs shadow-xs px-2.5 sm:px-3 whitespace-nowrap"
            >
              <SparklesIcon className="size-3.5" />
              <span>自动合成题库</span>
            </Button>

            {/* 模态框 2 触发：⚔️ 矩阵打擂 */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (readiness?.status === 'missing') {
                  toast.error(
                    `当前知识库完全缺失该题库所需的原材料文档！强行打擂将全部失分。\n请在右上角切换到【评测基准】知识库再运行打擂。`
                  )
                  return
                }
                setMatrixOpen(true)
              }}
              disabled={!datasetDetail || cases.length === 0}
              className={cn(
                'h-8 gap-1.5 text-xs transition-colors px-2.5 sm:px-3 whitespace-nowrap',
                readiness?.status === 'missing'
                  ? 'border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10'
                  : 'border-indigo-500/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10'
              )}
              tooltip={readiness?.status === 'missing' ? '原材料缺失不可打擂，点击查看提示' : undefined}
            >
              <SwordsIcon className="size-3.5" />
              <span>{readiness?.status === 'missing' ? '原料缺失(禁止打擂)' : '矩阵参数打擂'}</span>
            </Button>

            {/* 新窗口直达 MLflow 外部链接 */}
            <a
              href={mlflowUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/80 border border-border/50 transition-colors shrink-0 whitespace-nowrap"
              title="在新标签页独立打开 MLflow"
            >
              <span>新窗口</span>
              <ArrowUpRightIcon className="size-3.5" />
            </a>
          </div>
        </div>
      </div>

      {/* 2. 核心内容区域：按 activeSubTab 渲染 */}
      {activeSubTab === 'panorama' ? (
        /* ----------------------------------------------------------------- */
        /* 视图 A：题库与知识库资产全景大屏 (三层依赖、指标画像与直达打擂) */
        /* ----------------------------------------------------------------- */
        <div className="flex-1 min-h-0 overflow-hidden">
          <Suspense
            fallback={
              <div className="h-64 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2Icon className="size-6 animate-spin text-indigo-500" />
                <span>正在载入资产全景看板...</span>
              </div>
            }
          >
            <DatasetPanoramaView
              currentProjectId={currentProjectId}
              currentTenantId={currentTenantId}
              onNavigateToBattle={handleNavigateToBattle}
              onOpenSynthModal={() => setSynthOpen(true)}
            />
          </Suspense>
        </div>
      ) : activeSubTab === 'tasks' ? (
        /* ----------------------------------------------------------------- */
        /* 视图 C：评测任务大厅与成果总览看板 */
        /* ----------------------------------------------------------------- */
        <div className="flex-1 min-h-0 overflow-y-auto">
          <EvaluationTaskCenter
            currentProjectId={currentProjectId}
            onSwitchToTestsets={() => handleSubTabChange('cases')}
            onTriggerNewBattle={() => setMatrixOpen(true)}
          />
        </div>
      ) : activeSubTab === 'mlflow' ? (
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
          {/* 题库血缘与操作状态条 (全宽自适应，响应式排版) */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 bg-muted/25 px-3 py-2 rounded-lg border border-border/50 shrink-0 text-xs">
            <div className="flex flex-wrap items-center gap-2.5 min-w-0">
              {/* 题库选择下拉框 */}
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-muted-foreground font-medium whitespace-nowrap">当前评测集:</span>
                <select
                  value={selectedDatasetName}
                  onChange={(e) => setSelectedDatasetName(e.target.value)}
                  disabled={loadingDatasets}
                  className="text-xs h-7 pl-2 pr-7 max-w-[200px] sm:max-w-[260px] truncate rounded-md bg-background text-foreground border border-border/80 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium cursor-pointer"
                >
                  {datasets.length === 0 ? (
                    <option value="">暂无评测题库</option>
                  ) : (
                    <>
                      {projectDatasets.length > 0 && (
                        <optgroup label="【本项目专属题库】">
                          {projectDatasets.map((d) => (
                            <option key={d.name} value={d.name}>
                              🎯 {d.name} ({d.cases_count} 题)
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {benchmarkDatasets.length > 0 && (
                        <optgroup label="【平台通用基准】">
                          {benchmarkDatasets.map((d) => (
                            <option key={d.name} value={d.name}>
                              🏛️ {d.name} ({d.cases_count} 题)
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {otherDatasets.length > 0 && (
                        <optgroup label="【其他知识库题库】">
                          {otherDatasets.map((d) => (
                            <option key={d.name} value={d.name}>
                              📁 {d.name} ({d.cases_count} 题)
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </>
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

                {selectedDatasetName &&
                  selectedDatasetName !== 'business_qa.json' &&
                  selectedDatasetName !== 'sample_lightrag.json' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDeleteDataset}
                      disabled={deletingDataset}
                      className="size-7 p-0 text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 transition-colors"
                      tooltip="删除该题库(移入回收站)"
                    >
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  )}
              </div>

              <div className="h-4 w-px bg-border/60 hidden sm:block shrink-0" />

              {/* 知识库与血缘契约简要信息 (大屏幕展示全部，小屏幕收敛冗余项) */}
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span
                  className="hidden 2xl:inline-flex items-center gap-1"
                  title={`当前激活知识库: ${currentProjectName} (${currentProjectId})`}
                >
                  <FolderGit2Icon className="size-3 text-indigo-500" />
                  <span>知识库:</span>
                  <strong className="text-foreground font-medium truncate max-w-[120px]">
                    {currentProjectName}
                  </strong>
                </span>

                <span className="hidden 2xl:inline-flex items-center gap-1">
                  <LayersIcon className="size-3" />
                  <span>基线:</span>
                  <span className="font-mono text-foreground">
                    {datasetDetail?.corpus_manifest?.revision || 'rev_1'}
                  </span>
                </span>

                <span className="inline-flex items-center gap-1 shrink-0">
                  <FileTextIcon className="size-3" />
                  <span>覆盖:</span>
                  <strong className="text-foreground">
                    {docCount > 0 ? `${docCount} 篇` : '手工'}
                  </strong>
                </span>

                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors cursor-help shrink-0',
                    lineageStatus.className
                  )}
                  title={lineageStatus.desc}
                >
                  <span>{lineageStatus.badge}</span>
                </span>

                {/* 原材料就绪度指示徽章 (Readiness Guard) */}
                {checkingReadiness ? (
                  <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] bg-muted text-muted-foreground animate-pulse shrink-0">
                    <Loader2Icon className="size-2.5 animate-spin" />
                    <span>检测就绪度...</span>
                  </span>
                ) : readiness ? (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-colors cursor-help shrink-0',
                      readiness.status === 'ready' &&
                        'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30',
                      readiness.status === 'partial' &&
                        'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30',
                      readiness.status === 'missing' &&
                        'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30 font-semibold'
                    )}
                    title={
                      readiness.status === 'missing'
                        ? `【严重警告】当前库完全缺失该题库所需的原材料文档！(缺失 ${readiness.missing_docs.length} 篇)`
                        : readiness.status === 'partial'
                          ? `【部分就绪】具备 ${readiness.matched_docs.length}/${readiness.total_required} 篇文档，缺失 ${readiness.missing_docs.length} 篇（${readiness.missing_docs.slice(0, 3).join(', ')}${readiness.missing_docs.length > 3 ? ` 等共 ${readiness.missing_docs.length} 篇` : ''}）`
                          : `【契约就绪】当前知识库包含题库所需的全部 ${readiness.total_required} 篇原材料文档，可随时启动矩阵打擂！`
                    }
                  >
                    {readiness.status === 'ready' && <CheckCircle2Icon className="size-3" />}
                    {readiness.status === 'partial' && <AlertCircleIcon className="size-3" />}
                    {readiness.status === 'missing' && <AlertTriangleIcon className="size-3" />}
                    <span>
                      {readiness.status === 'ready' && `🟢 契约就绪 (${Math.round(readiness.coverage_rate * 100)}%)`}
                      {readiness.status === 'partial' && `🟡 部分原料 (${readiness.matched_docs.length}/${readiness.total_required})`}
                      {readiness.status === 'missing' && `🔴 原料缺失 (0/${readiness.total_required})`}
                    </span>
                  </span>
                ) : null}
              </div>
            </div>

            {/* 表格操作：搜索过滤 + 新增题目 + 保存 */}
            <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
              <div className="relative w-36 sm:w-48 lg:w-56">
                <SearchIcon className="size-3 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="搜索问题或答案..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs pl-7 pr-2.5 py-1 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleAddCase}
                className="h-7 gap-1 text-xs px-2 sm:px-2.5 whitespace-nowrap"
              >
                <PlusIcon className="size-3" />
                <span>添加考题</span>
              </Button>

              <Button
                size="sm"
                onClick={handleSaveDataset}
                disabled={!isDirty || saving}
                className={cn(
                  'h-7 gap-1 text-xs px-2.5 sm:px-3 transition-all whitespace-nowrap',
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

          {/* 原料缺失置顶告警横幅 (Readiness Missing Warning) */}
          {readiness && readiness.status === 'missing' && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs shrink-0 animate-in fade-in duration-200">
              <div className="flex items-center gap-2.5 min-w-0">
                <AlertTriangleIcon className="size-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <div className="min-w-0">
                  <span className="font-semibold">
                    {readiness.is_mismatched ? '【契约拦截】检测到知识库不匹配！' : '【契约拦截】当前知识库完全缺失该评测集所需的全部原材料文档！'}
                  </span>
                  <span className="text-[11px] opacity-90 block mt-0.5">
                    {readiness.message ||
                      `所需原材料文档缺失共 ${readiness.missing_docs.length} 篇（如 ${readiness.missing_docs.slice(0, 3).join(', ')}${readiness.missing_docs.length > 3 ? ' 等' : ''}）不在当前知识库中。已主动拦截矩阵打擂！`}
                  </span>
                </div>
              </div>

              {readiness.target_project_id &&
                readiness.target_project_id !== 'all' &&
                readiness.target_project_id !== currentProjectId && (
                  <Button
                    size="sm"
                    onClick={() =>
                      handleQuickSwitchProject(
                        readiness.target_project_id!,
                        readiness.target_tenant_id
                      )
                    }
                    className="h-7 px-3 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shrink-0 self-end sm:self-center gap-1 shadow-xs"
                  >
                    <span>👉 一键切换至知识库「{readiness.target_project_name || readiness.target_project_id}」</span>
                  </Button>
                )}
            </div>
          )}

          {/* 3. 汇总数据表格 (Full-width Data Table with responsive min-width) */}
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
              <div className="min-w-[960px] w-full">
                <Table className="w-full text-xs table-fixed">
                  <TableHeader className="sticky top-0 bg-muted/90 backdrop-blur-xs z-10 border-b border-border/80">
                    <TableRow className="hover:bg-transparent text-muted-foreground font-semibold">
                      <TableHead className="w-12 text-center py-2.5">#</TableHead>
                      <TableHead className="w-24 py-2.5">用例标识</TableHead>
                      <TableHead className="min-w-[280px] py-2.5">提问问题 (Question / Query)</TableHead>
                      <TableHead className="w-52 xl:w-64 py-2.5">标准黄金答案 (Ground Truth)</TableHead>
                      <TableHead className="w-48 lg:w-56 py-2.5">支撑上下文</TableHead>
                      <TableHead className="w-16 text-right pr-4 py-2.5">操作</TableHead>
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
                            <span className="font-mono text-xs font-medium text-foreground block truncate" title={c.id || `case_${index + 1}`}>
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
                                    <span className="shrink-0">{ctxs.length} 个切片证据</span>
                                    <span className="text-[9px] text-muted-foreground font-normal shrink-0">
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
                                className="text-left font-mono text-[10px] text-muted-foreground/70 hover:text-indigo-600 dark:hover:text-indigo-400 bg-muted/20 hover:bg-indigo-500/5 px-2 py-1.5 rounded-md border border-dashed border-border/60 hover:border-indigo-500/40 transition-colors w-full flex items-center justify-between gap-1 cursor-pointer"
                                title="该考题暂无切片证据，点击可手动补充录入"
                              >
                                <span className="truncate">未关联切片</span>
                                <span className="text-[10px] text-indigo-500 font-semibold hover:underline shrink-0 whitespace-nowrap">
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
              </div>
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
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {ctxs.map((ctxText, idx) => (
                        <div
                          key={idx}
                          onClick={() => setFocusSlice({ index: idx + 1, text: ctxText, caseId: inspectCase?.id })}
                          className="group/slice p-2.5 rounded-md bg-muted/30 hover:bg-muted/60 font-mono text-[11px] text-foreground/90 leading-relaxed border border-border/40 hover:border-indigo-500/70 transition-all cursor-pointer select-text shadow-2xs"
                          title="点击卡片放大检视该切片完整全文"
                        >
                          <div className="text-[10px] font-semibold text-indigo-500 mb-1 flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold">
                                切片 #{idx + 1}
                              </span>
                              <span className="text-muted-foreground font-normal">{ctxText.length} 字符</span>
                            </span>
                            <span className="text-muted-foreground group-hover/slice:text-indigo-600 dark:group-hover/slice:text-indigo-400 flex items-center gap-1 transition-colors font-medium">
                              <Maximize2Icon className="size-2.5" />
                              <span>点击看全文</span>
                            </span>
                          </div>
                          <div className="whitespace-pre-wrap break-words">
                            {ctxText}
                          </div>
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
      {/* 模态框 0.5：🔍 切片证据完整透视大视窗 (Slice Focus Dialog) */}
      {/* ------------------------------------------------------------------- */}
      <Dialog open={Boolean(focusSlice)} onOpenChange={(open) => !open && setFocusSlice(null)}>
        <DialogContent className="sm:max-w-[720px] max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0 border-b border-border/60 pb-3">
            <DialogTitle className="flex items-center justify-between pr-6">
              <span className="flex items-center gap-2">
                <FileTextIcon className="size-4.5 text-indigo-500" />
                <span>切片完整内容透视 (切片 #{focusSlice?.index})</span>
              </span>
              <span className="text-xs font-normal text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded border border-border/50">
                共 {focusSlice?.text.length || 0} 字符
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              展示底层知识切片的 100% 完整原文，支持全文自由阅读、复制与比对。
            </DialogDescription>
          </DialogHeader>

          {focusSlice && (
            <div className="flex-1 overflow-y-auto py-3 space-y-3 pr-1">
              {/* 原文卡片 */}
              <div className="p-4 rounded-lg bg-muted/40 border border-border/80 font-mono text-xs leading-relaxed text-foreground select-text whitespace-pre-wrap break-words">
                {focusSlice.text}
              </div>

              {/* 省略号出处说明 */}
              {(focusSlice.text.endsWith('...') || focusSlice.text.endsWith('…') || focusSlice.text.includes('...')) && (
                <div className="p-3 rounded-md bg-sky-500/5 border border-sky-500/20 text-sky-800 dark:text-sky-300 text-xs flex items-start gap-2">
                  <InfoIcon className="size-4 shrink-0 mt-0.5 text-sky-500" />
                  <div className="space-y-0.5 text-[11px] leading-relaxed">
                    <p className="font-semibold">关于切片末尾省略号 (…) 的出处说明：</p>
                    <p className="text-muted-foreground">
                      该切片来源于华为诺亚方舟 RGB 开源基准原始语料。原数据集在抓取网页新闻时即为搜索引擎快照摘要（Snippet），文本末尾原生带有省略号。上方展示即为此切片在题库中的 <b>100% 完整原始内容</b>，无任何前端截断。
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="pt-2 shrink-0 border-t border-border/40 flex items-center justify-between sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => {
                if (focusSlice?.text) {
                  navigator.clipboard.writeText(focusSlice.text)
                  toast.success('已复制切片完整文本至剪贴板！')
                }
              }}
            >
              <CopyIcon className="size-3.5" />
              <span>复制切片全文</span>
            </Button>
            <Button size="sm" onClick={() => setFocusSlice(null)}>
              关闭
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
              {/* 题库维护策略：覆盖更新当前专属题库 vs 创建新版本 */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  题库维护策略 (防泛滥治理)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div
                    onClick={() => {
                      setSynthTargetMode('overwrite')
                      if (selectedDatasetName) setSynthName(selectedDatasetName)
                    }}
                    className={cn(
                      'p-2 rounded-lg border text-left cursor-pointer transition-all',
                      synthTargetMode === 'overwrite'
                        ? 'border-indigo-500 bg-indigo-500/10 text-foreground font-medium ring-1 ring-indigo-500/30'
                        : 'border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/60'
                    )}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                        🔄 覆盖更新当前题库
                      </span>
                      <input
                        type="radio"
                        name="synthTargetMode"
                        checked={synthTargetMode === 'overwrite'}
                        readOnly
                        className="size-3 accent-indigo-500"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                      保持单一专属题库，差量迭代
                    </p>
                  </div>

                  <div
                    onClick={() => {
                      setSynthTargetMode('create')
                      const prefix = currentProjectId ? currentProjectId.slice(0, 8) : 'custom'
                      setSynthName(
                        `${prefix}_synth_${new Date().toISOString().slice(5, 10).replace('-', '')}.json`
                      )
                    }}
                    className={cn(
                      'p-2 rounded-lg border text-left cursor-pointer transition-all',
                      synthTargetMode === 'create'
                        ? 'border-indigo-500 bg-indigo-500/10 text-foreground font-medium ring-1 ring-indigo-500/30'
                        : 'border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/60'
                    )}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold">✨ 创建新题库版本</span>
                      <input
                        type="radio"
                        name="synthTargetMode"
                        checked={synthTargetMode === 'create'}
                        readOnly
                        className="size-3 accent-indigo-500"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      保留历史，新建独立版本
                    </p>
                  </div>
                </div>
              </div>

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
            <div className="py-4 space-y-3.5 text-center">
              <div className="size-10 rounded-full bg-indigo-500/10 text-indigo-500 flex items-center justify-center mx-auto">
                <Loader2Icon className="size-5 animate-spin" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  {matrixLimitMode === 'quick' ? '🚀 极速打擂评测并发执行中...' : '📊 全量矩阵打擂并发评估中...'}
                </p>
                <p className="text-xs text-muted-foreground font-mono">
                  {matrixTaskStatus.message}
                </p>
              </div>
              <div className="space-y-1 px-1">
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>实时流式推流进度</span>
                  <span className="font-mono font-semibold text-indigo-500">{matrixTaskStatus.progress || 10}%</span>
                </div>
                <Progress value={matrixTaskStatus.progress || 10} className="h-1.5" />
              </div>

              {/* 实时控制台推流终端窗格 (Console Log Drawer) */}
              {matrixTaskStatus.logs && matrixTaskStatus.logs.length > 0 && (
                <div className="text-left bg-slate-950 text-slate-200 p-2.5 rounded-lg font-mono text-[10px] h-36 overflow-y-auto space-y-1 border border-slate-800 shadow-inner">
                  {matrixTaskStatus.logs.slice(-25).map((line, idx) => (
                    <div key={idx} className="leading-tight break-all">
                      <span className="text-emerald-400 select-none mr-1.5">›</span>
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : matrixTaskStatus && matrixTaskStatus.status === 'completed' ? (
            <div className="py-4 space-y-4">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-center space-y-2">
                <CheckCircle2Icon className="size-8 text-emerald-500 mx-auto" />
                <h4 className="text-sm font-semibold text-foreground">打擂评估已圆满完成！</h4>
                <p className="text-xs text-muted-foreground">
                  评测指标、详细打分及问答轨迹已完整同步至 MLflow 实验平台。
                </p>
                {matrixTaskStatus.runs && matrixTaskStatus.runs.length > 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1 text-[10px] font-mono text-muted-foreground">
                    <span>参评 Runs:</span>
                    {matrixTaskStatus.runs.map((r) => (
                      <span key={r} className="px-1.5 py-0.5 rounded bg-muted border border-border/80">
                        {r.slice(0, 8)}...
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {matrixTaskStatus.result_url ? (
                  <a
                    href={matrixTaskStatus.result_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-indigo-500 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm"
                  >
                    <span>🔥 查看本次打擂对比大屏 (Compare Runs)</span>
                    <ExternalLinkIcon className="size-3.5" />
                  </a>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      setMatrixOpen(false)
                      handleSubTabChange('mlflow')
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                  >
                    <BarChart3Icon className="size-3.5 mr-1" />
                    <span>切换至嵌入评测大屏</span>
                  </Button>
                )}
                <a
                  href={mlflowUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border/80 bg-background hover:bg-muted text-foreground text-xs font-semibold"
                >
                  <span>打开 MLflow 实验主页</span>
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

              {/* 原材料就绪度契约校验与告警 (Readiness Status Alert) */}
              {readiness && readiness.status === 'missing' && (
                <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5">
                  <AlertTriangleIcon className="size-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-semibold">【契约拦截】当前知识库完全缺失该评测集的原材料文档</div>
                    <div className="text-[11px] opacity-90 leading-relaxed">
                      当前激活库「{currentProjectName}」未包含此评测集所需的任何文档（缺失共 {readiness.missing_docs.length} 篇，如 {readiness.missing_docs.slice(0, 3).join(', ')}{readiness.missing_docs.length > 3 ? ' 等' : ''}）。
                      由于召回切片为空，强行打擂将全部失分。请在主界面右上角切换到对应知识库或灌入文档后再评测。
                    </div>
                  </div>
                </div>
              )}

              {readiness && readiness.status === 'partial' && (
                <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs flex items-start gap-2">
                  <AlertCircleIcon className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div className="text-[11px] leading-relaxed">
                    <strong>部分原料就绪：</strong>当前库包含 {readiness.matched_docs.length}/{readiness.total_required} 篇文档，缺失 {readiness.missing_docs.length} 篇（{readiness.missing_docs.slice(0, 3).join(', ')}{readiness.missing_docs.length > 3 ? ` 等共 ${readiness.missing_docs.length} 篇` : ''}），打擂可能部分失分。
                  </div>
                </div>
              )}

              {/* 打擂抽样模式选择 */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  打擂评测模式 (抽样控制)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div
                    onClick={() => setMatrixLimitMode('quick')}
                    className={cn(
                      'p-2.5 rounded-lg border text-left cursor-pointer transition-all',
                      matrixLimitMode === 'quick'
                        ? 'border-indigo-500 bg-indigo-500/10 text-foreground font-medium ring-1 ring-indigo-500/30'
                        : 'border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/60'
                    )}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">🚀 极速打擂验证</span>
                      <input
                        type="radio"
                        name="limitMode"
                        checked={matrixLimitMode === 'quick'}
                        readOnly
                        className="size-3 accent-indigo-500"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      抽样前 5 题，约 30 秒出分，日常验证首选
                    </p>
                  </div>

                  <div
                    onClick={() => setMatrixLimitMode('full')}
                    className={cn(
                      'p-2.5 rounded-lg border text-left cursor-pointer transition-all',
                      matrixLimitMode === 'full'
                        ? 'border-indigo-500 bg-indigo-500/10 text-foreground font-medium ring-1 ring-indigo-500/30'
                        : 'border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/60'
                    )}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold">📊 全量深度打擂</span>
                      <input
                        type="radio"
                        name="limitMode"
                        checked={matrixLimitMode === 'full'}
                        readOnly
                        className="size-3 accent-indigo-500"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      全部考题基线，深度验证与留痕归档
                    </p>
                  </div>
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
                  disabled={selectedModes.length === 0 || readiness?.status === 'missing'}
                  className={cn(
                    'text-white transition-all',
                    readiness?.status === 'missing'
                      ? 'bg-muted text-muted-foreground border border-border cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  )}
                >
                  {readiness?.status === 'missing'
                    ? '❌ 原料缺失无法打擂 (请切换基准库)'
                    : matrixLimitMode === 'quick'
                      ? '🚀 启动极速打擂 (抽样 5 题)'
                      : '📊 启动全量深度打擂'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
