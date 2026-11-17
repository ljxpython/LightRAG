import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  FolderKanbanIcon,
  LayersIcon,
  FileTextIcon,
  SparklesIcon,
  SearchIcon,
  RefreshCwIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  SwordsIcon,
  DatabaseIcon,
  CpuIcon,
  GlobeIcon,
  BookOpenIcon,
  FilterIcon,
  CopyIcon,
  CheckIcon,
  Edit3Icon,
  Maximize2Icon,
  ExternalLinkIcon,
  XIcon,
  Loader2Icon,
  InfoIcon,
  ImageIcon,
  AlertCircleIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'
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
import { toast } from 'sonner'
import { copyToClipboard } from '@/utils/clipboard'

export interface PanoramaSampleCase {
  id: string
  question: string
  ground_truth: string
  context_count: number
  contexts?: string[]
  context?: string
}

export interface PanoramaDatasetItem {
  name: string
  project_id: string
  tenant_id: string
  project_name: string
  target_project_id: string
  target_project_name: string
  is_benchmark: boolean
  revision_id: string
  cases_count: number
  source_docs: string[]
  corpus_docs_count: number
  sample_cases: PanoramaSampleCase[]
  engine?: string
  model?: string
  size_bytes: number
  updated_at: string
}

interface WorkspaceInfo {
  tenant_id: string
  project_id: string
  name: string
  code?: string
}

interface ChunkItem {
  chunk_id: string
  tokens: number
  content: string
  chunk_order_index?: number
}

interface DocContentData {
  status: string
  doc_id: string
  doc_name?: string
  project_id?: string
  tenant_id?: string
  found?: boolean
  full_content: string
  chunks_count: number
  chunks: ChunkItem[]
  source_workspace?: string
  is_media?: boolean
  raw_url?: string | null
  is_synthetic_context?: boolean
  notice?: string
}

interface DatasetPanoramaViewProps {
  currentProjectId: string
  currentTenantId: string
  onNavigateToBattle: (datasetName: string, targetProjectId: string, targetTenantId?: string) => Promise<void> | void
  onOpenSynthModal: () => void
}

export default function DatasetPanoramaView({
  currentProjectId,
  currentTenantId,
  onNavigateToBattle,
  onOpenSynthModal
}: DatasetPanoramaViewProps) {
  const [datasets, setDatasets] = useState<PanoramaDatasetItem[]>([])
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>('all')
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<'all' | 'custom' | 'benchmark'>('all')

  // 折叠抽屉状态
  const [expandedDocs, setExpandedDocs] = useState<Record<string, boolean>>({})
  const [expandedCases, setExpandedCases] = useState<Record<string, boolean>>({})
  const [navigatingName, setNavigatingName] = useState<string | null>(null)

  // -------------------------------------------------------------------------
  // 需求 1：原材料文档弹窗查看状态 (Document Content Preview Modal)
  // -------------------------------------------------------------------------
  const [previewDocName, setPreviewDocName] = useState<string | null>(null)
  const [previewDocLoading, setPreviewDocLoading] = useState(false)
  const [previewDocData, setPreviewDocData] = useState<DocContentData | null>(null)
  const [previewDocTab, setPreviewDocTab] = useState<'chunks' | 'full'>('chunks')
  const [copiedDocId, setCopiedDocId] = useState<string | null>(null)

  // -------------------------------------------------------------------------
  // 需求 2：考题 Case 点击检视、修改边界与上下文编辑弹窗 (Case Detail Modal)
  // -------------------------------------------------------------------------
  const [inspectCase, setInspectCase] = useState<{
    datasetName: string
    caseItem: PanoramaSampleCase
    caseIndex: number
  } | null>(null)
  const [isEditingContext, setIsEditingContext] = useState(false)
  const [editingContextText, setEditingContextText] = useState('')
  const [savingCase, setSavingCase] = useState(false)
  const [focusSlice, setFocusSlice] = useState<{ index: number; text: string } | null>(null)

  // 1. 获取题库列表与工作区映射
  const loadData = async () => {
    try {
      setRefreshing(true)
      const [resDatasets, resWorkspaces] = await Promise.all([
        fetch('/ops/evaluation/datasets'),
        fetch('/ops/workspaces').catch(() => null)
      ])

      if (resDatasets.ok) {
        const dJson = await resDatasets.json()
        setDatasets(dJson.datasets || [])
      }

      if (resWorkspaces && resWorkspaces.ok) {
        const wJson = await resWorkspaces.json()
        setWorkspaces(wJson.workspaces || [])
      }
    } catch (err) {
      console.error('Failed to load panorama data:', err)
      toast.error('加载题库资产全景失败')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // 2. 统计宏观指标
  const stats = useMemo(() => {
    const totalDatasets = datasets.length
    const totalCases = datasets.reduce((sum, d) => sum + (d.cases_count || 0), 0)
    const benchmarkCount = datasets.filter((d) => d.is_benchmark).length
    const customCount = totalDatasets - benchmarkCount

    // 去重统计所有原材料文档
    const allDocs = new Set<string>()
    datasets.forEach((d) => {
      ;(d.source_docs || []).forEach((doc) => allDocs.add(doc))
    })

    // 统计关联的独立知识库数（名下有题库的知识库）
    const projects = new Set<string>()
    datasets.forEach((d) => {
      if (!d.is_benchmark && d.target_project_id && d.target_project_id !== 'all') {
        projects.add(d.target_project_id)
      }
    })

    return {
      totalDatasets,
      totalCases,
      benchmarkCount,
      customCount,
      uniqueDocsCount: allDocs.size,
      coveredProjectsCount: projects.size
    }
  }, [datasets])

  // 3. 过滤出名下真正有题库的项目，彻底消除 (0) 选项
  const validWorkspacesWithDatasets = useMemo(() => {
    return workspaces
      .map((w) => {
        const count = datasets.filter((d) => d.target_project_id === w.project_id).length
        return { ...w, count }
      })
      .filter((w) => w.count > 0)
  }, [workspaces, datasets])

  // 4. 项目与分类过滤
  const filteredDatasets = useMemo(() => {
    return datasets.filter((d) => {
      // 知识库过滤
      if (selectedProjectFilter !== 'all') {
        if (selectedProjectFilter === '__benchmark__') {
          if (!d.is_benchmark) return false
        } else if (d.target_project_id !== selectedProjectFilter) {
          return false
        }
      }

      // 类型过滤
      if (selectedTypeFilter === 'benchmark' && !d.is_benchmark) return false
      if (selectedTypeFilter === 'custom' && d.is_benchmark) return false

      // 关键词搜索
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchName = d.name.toLowerCase().includes(q)
        const matchProject = (d.target_project_name || '').toLowerCase().includes(q)
        const matchDocs = (d.source_docs || []).some((doc) => doc.toLowerCase().includes(q))
        const matchCases = (d.sample_cases || []).some(
          (c) => c.question.toLowerCase().includes(q) || c.ground_truth.toLowerCase().includes(q)
        )
        if (!matchName && !matchProject && !matchDocs && !matchCases) return false
      }

      return true
    })
  }, [datasets, selectedProjectFilter, selectedTypeFilter, searchQuery])

  // 5. 原材料文档内容查看弹窗逻辑
  const handleViewDocContent = async (docName: string, targetProjectId: string, targetTenantId?: string) => {
    setPreviewDocName(docName)
    setPreviewDocLoading(true)
    setPreviewDocData(null)
    setPreviewDocTab('chunks')

    try {
      const proj = targetProjectId && targetProjectId !== 'all' ? targetProjectId : currentProjectId
      const tenant = targetTenantId || currentTenantId || '__default'
      const url = `/ops/documents/${encodeURIComponent(docName)}/content?project_id=${encodeURIComponent(proj)}&tenant_id=${encodeURIComponent(tenant)}`
      const res = await fetch(url)
      if (res.ok) {
        const data: DocContentData = await res.json()
        setPreviewDocData(data)
        if (data.chunks_count === 0 && data.full_content) {
          setPreviewDocTab('full')
        }
      } else {
        toast.error(`读取原材料文档「${docName}」失败`)
      }
    } catch (err) {
      console.error('Failed to fetch doc content:', err)
      toast.error('请求原材料文档内容异常')
    } finally {
      setPreviewDocLoading(false)
    }
  }

  // 6. 考题 Case 详情检视与切片边界编辑逻辑
  const handleOpenCaseDetail = async (datasetName: string, caseItem: PanoramaSampleCase, index: number) => {
    setIsEditingContext(false)
    setFocusSlice(null)

    // 优先从题库完整数据中提取详细 contexts
    try {
      const res = await fetch(`/ops/evaluation/datasets/${encodeURIComponent(datasetName)}`)
      if (res.ok) {
        const detail = await res.json()
        const fullCases = detail.cases || detail.test_cases || []
        const matched = fullCases[index] || fullCases.find((c: any) => c.id === caseItem.id || c.question === caseItem.question)
        if (matched) {
          const rawCtxs = Array.isArray(matched.contexts)
            ? matched.contexts
            : matched.context
            ? [matched.context]
            : []
          const cleanedCtxs = rawCtxs.map((c: any) => String(c || '').trim()).filter(Boolean)
          setInspectCase({
            datasetName,
            caseIndex: index,
            caseItem: {
              ...caseItem,
              question: matched.query || matched.question || caseItem.question,
              ground_truth: matched.answer || matched.ground_truth || caseItem.ground_truth,
              contexts: cleanedCtxs,
              context: cleanedCtxs.join('\n\n')
            }
          })
          setEditingContextText(cleanedCtxs.join('\n\n'))
          return
        }
      }
    } catch (e) {
      console.warn('Failed to fetch dataset detail, fallback to sample:', e)
    }

    // Fallback
    const initialCtx = caseItem.contexts?.length ? caseItem.contexts.join('\n\n') : caseItem.context || ''
    setInspectCase({
      datasetName,
      caseItem,
      caseIndex: index
    })
    setEditingContextText(initialCtx)
  }

  // 7. 保存切片边界与上下文回写磁盘
  const handleSaveCaseContext = async () => {
    if (!inspectCase) return
    try {
      setSavingCase(true)
      const resDetail = await fetch(`/ops/evaluation/datasets/${encodeURIComponent(inspectCase.datasetName)}`)
      if (!resDetail.ok) {
        toast.error('获取题库全量数据失败')
        return
      }
      const fullData = await resDetail.json()
      const allCases = fullData.cases || fullData.test_cases || []
      const trimmedText = editingContextText.trim()
      const newContexts = trimmedText ? [trimmedText] : []

      // 寻找并更新对应考题
      let targetIdx = inspectCase.caseIndex
      if (targetIdx < 0 || targetIdx >= allCases.length || allCases[targetIdx].question !== inspectCase.caseItem.question) {
        targetIdx = allCases.findIndex(
          (c: any) => c.id === inspectCase.caseItem.id || c.question === inspectCase.caseItem.question
        )
      }

      if (targetIdx !== -1) {
        allCases[targetIdx].contexts = newContexts
        allCases[targetIdx].context = trimmedText
      } else {
        toast.error('未在题库中定位到目标考题')
        return
      }

      // 回写保存到后端
      const saveRes = await fetch(`/ops/evaluation/datasets/${encodeURIComponent(inspectCase.datasetName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          corpus_manifest: fullData.corpus_manifest,
          cases: allCases
        })
      })

      if (saveRes.ok) {
        toast.success(`考题 #${targetIdx + 1} 支撑切片边界已成功保存回写至题库！`)
        setIsEditingContext(false)
        setInspectCase((prev) =>
          prev
            ? {
                ...prev,
                caseItem: {
                  ...prev.caseItem,
                  contexts: newContexts,
                  context: trimmedText,
                  context_count: newContexts.length
                }
              }
            : null
        )
        // 刷新列表数据
        await loadData()
      } else {
        toast.error('持久化保存切片失败')
      }
    } catch (err) {
      console.error('Save case error:', err)
      toast.error(`保存失败: ${err}`)
    } finally {
      setSavingCase(false)
    }
  }

  // 8. 复制工具
  const handleCopyText = async (text: string, id: string) => {
    const res = await copyToClipboard(text)
    if (res.success) {
      setCopiedDocId(id)
      toast.success('已复制到剪贴板')
      setTimeout(() => setCopiedDocId(null), 2000)
    }
  }

  // 9. 处理“前往评测打擂”
  const handleLaunchBattle = async (dataset: PanoramaDatasetItem) => {
    try {
      setNavigatingName(dataset.name)
      await onNavigateToBattle(dataset.name, dataset.target_project_id, dataset.tenant_id)
    } finally {
      setNavigatingName(null)
    }
  }

  const toggleDocs = (name: string) => {
    setExpandedDocs((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  const toggleCases = (name: string) => {
    setExpandedCases((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  // 当前知识库显示名
  const currentProjectDisplayName = useMemo(() => {
    const found = workspaces.find((w) => w.project_id === currentProjectId)
    if (found) return found.name || found.project_id
    if (currentProjectId === '11111111-1111-4111-8111-111111111111') return '平台默认项目'
    if (currentProjectId === 'eval_benchmark') return '评测基准'
    if (currentProjectId === 'eval_multihop') return 'eval_multihop'
    if (currentProjectId === 'eval_rgb_zh') return '华为 RGB 评测基准 (中文)'
    return currentProjectId.length > 16 ? `${currentProjectId.slice(0, 8)}...` : currentProjectId
  }, [workspaces, currentProjectId])

  return (
    <div className="flex flex-col gap-5 p-5 min-h-0 h-full overflow-y-auto">
      {/* 1. 顶部全景总览横幅 (Hero Header) */}
      <div className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-background p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
                <LayersIcon className="size-3.5" /> 资产与依赖拓扑
              </span>
              <span className="text-xs text-muted-foreground">
                当前激活知识库: <strong className="text-foreground">{currentProjectDisplayName}</strong>
              </span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground mt-2">
              题库资产全景与知识库对照 (Evaluation Asset Panorama)
            </h1>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
              清晰掌控「评测集 - 知识库项目 - 原材料文档」三层依赖关系。点击原材料文档可直接查看解析正文与切片，点击考题可在线修改边界，点击打擂一键自动对齐切换知识库！
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={refreshing}
              className="h-9 gap-1.5 text-xs bg-background/80 hover:bg-muted"
            >
              <RefreshCwIcon className={cn('size-3.5', refreshing && 'animate-spin text-indigo-500')} />
              <span>刷新全景</span>
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={onOpenSynthModal}
              className="h-9 gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
            >
              <SparklesIcon className="size-3.5" />
              <span>合成专属题库</span>
            </Button>
          </div>
        </div>

        {/* 宏观指标卡片矩阵 (Metrics Cards) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5 pt-4 border-t border-border/50">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-card/60 border border-border/60 backdrop-blur-xs">
            <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <FolderKanbanIcon className="size-4" />
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground font-medium">纳管评测集总数</div>
              <div className="text-lg font-bold text-foreground">
                {stats.totalDatasets} <span className="text-xs font-normal text-muted-foreground">套</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-card/60 border border-border/60 backdrop-blur-xs">
            <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <DatabaseIcon className="size-4" />
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground font-medium">覆盖知识库项目</div>
              <div className="text-lg font-bold text-foreground">
                {stats.coveredProjectsCount}{' '}
                <span className="text-xs font-normal text-muted-foreground">个 (+通用基准)</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-card/60 border border-border/60 backdrop-blur-xs">
            <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <FileTextIcon className="size-4" />
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground font-medium">累计纳管考题</div>
              <div className="text-lg font-bold text-foreground">
                {stats.totalCases} <span className="text-xs font-normal text-muted-foreground">道标准题</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-card/60 border border-border/60 backdrop-blur-xs">
            <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <BookOpenIcon className="size-4" />
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground font-medium">依赖原材料文档</div>
              <div className="text-lg font-bold text-foreground">
                {stats.uniqueDocsCount} <span className="text-xs font-normal text-muted-foreground">篇物料</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. 筛选过滤控制栏 (Filter Toolbar) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-card/80 border border-border/60 backdrop-blur-sm shadow-2xs">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* 知识库项目筛选器（过滤掉 0 题库的项目，干净清爽） */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FilterIcon className="size-3.5" />
            <span>知识库归属:</span>
          </div>
          <select
            value={selectedProjectFilter}
            onChange={(e) => setSelectedProjectFilter(e.target.value)}
            className="h-8 px-2.5 rounded-lg border border-border bg-background text-xs font-medium text-foreground focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
          >
            <option value="all">🌐 全部知识库 ({datasets.length})</option>
            <option value="__benchmark__">🏛️ 全局通用基准 ({stats.benchmarkCount})</option>
            {validWorkspacesWithDatasets.length > 0 && (
              <optgroup label="🏢 专属知识库项目">
                {validWorkspacesWithDatasets.map((w) => (
                  <option key={w.project_id} value={w.project_id}>
                    {w.name || w.project_id} ({w.count})
                  </option>
                ))}
              </optgroup>
            )}
          </select>

          {/* 类型筛选 */}
          <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border border-border/50 text-xs">
            <button
              onClick={() => setSelectedTypeFilter('all')}
              className={cn(
                'px-2.5 py-1 rounded-md transition-all font-medium',
                selectedTypeFilter === 'all'
                  ? 'bg-background text-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              全部
            </button>
            <button
              onClick={() => setSelectedTypeFilter('custom')}
              className={cn(
                'px-2.5 py-1 rounded-md transition-all font-medium',
                selectedTypeFilter === 'custom'
                  ? 'bg-background text-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              专属题库 ({stats.customCount})
            </button>
            <button
              onClick={() => setSelectedTypeFilter('benchmark')}
              className={cn(
                'px-2.5 py-1 rounded-md transition-all font-medium',
                selectedTypeFilter === 'benchmark'
                  ? 'bg-background text-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              通用基准 ({stats.benchmarkCount})
            </button>
          </div>
        </div>

        {/* 搜索框 */}
        <div className="relative w-full sm:w-72">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索题库名、原材料文档或考题..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-8 pr-2.5 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* 3. 评测集卡片列表 (Asset Cards) */}
      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
          <RefreshCwIcon className="size-6 animate-spin text-indigo-500" />
          <span>正在构建题库与知识库全景视图...</span>
        </div>
      ) : filteredDatasets.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center gap-2 text-center p-6 rounded-2xl border border-dashed border-border/80 bg-card/40">
          <FolderKanbanIcon className="size-8 text-muted-foreground/60" />
          <p className="text-xs font-semibold text-foreground">没有找到匹配的评测集</p>
          <p className="text-[11px] text-muted-foreground max-w-sm">
            您可以尝试放宽筛选条件，或者点击右上角“合成专属题库”为当前知识库生成首个评测集。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredDatasets.map((d) => {
            const isTargetCurrent =
              d.is_benchmark || d.target_project_id === 'all' || d.target_project_id === currentProjectId
            const isDocsExpanded = !!expandedDocs[d.name]
            const isCasesExpanded = !!expandedCases[d.name]
            const isLaunching = navigatingName === d.name

            return (
              <Card
                key={d.name}
                className={cn(
                  'rounded-xl border transition-all duration-200 bg-card/70 hover:bg-card/90 shadow-2xs hover:shadow-sm overflow-hidden',
                  isTargetCurrent ? 'border-border/70 hover:border-indigo-500/40' : 'border-amber-500/30 bg-amber-500/2'
                )}
              >
                <CardContent className="p-4 sm:p-5 flex flex-col gap-3.5">
                  {/* 第一行：题库名称、归属项目与直达打擂按钮 */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          'p-2 rounded-lg shrink-0 mt-0.5 sm:mt-0',
                          d.is_benchmark
                            ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                            : isTargetCurrent
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        )}
                      >
                        {d.is_benchmark ? <GlobeIcon className="size-4" /> : <DatabaseIcon className="size-4" />}
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm text-foreground truncate">{d.name}</span>

                          {/* 题库类型与归属标签 */}
                          {d.is_benchmark ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                              🏛️ 全局通用基准
                            </span>
                          ) : (
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded-full text-[10px] font-medium border',
                                isTargetCurrent
                                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
                                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20'
                              )}
                            >
                              🏢 专属归属: {d.target_project_name || d.target_project_id}
                            </span>
                          )}

                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border/50">
                            {d.cases_count} 道考题
                          </span>
                        </div>

                        {/* 状态与对齐说明 */}
                        <div className="text-[11px] text-muted-foreground mt-1 flex flex-wrap items-center gap-3">
                          <span>大小: {(d.size_bytes / 1024).toFixed(1)} KB</span>
                          <span>•</span>
                          <span>版本: {d.revision_id || 'rev_1'}</span>
                          {d.engine && (
                            <>
                              <span>•</span>
                              <span className="inline-flex items-center gap-1">
                                <CpuIcon className="size-3 text-muted-foreground" />
                                {d.engine} {d.model ? `(${d.model})` : ''}
                              </span>
                            </>
                          )}
                          <span>•</span>
                          <span>更新: {new Date(d.updated_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* 右侧核心动作按钮：前往打擂 */}
                    <div className="shrink-0 flex items-center gap-2 self-end sm:self-center">
                      <Button
                        size="sm"
                        variant={isTargetCurrent ? 'default' : 'secondary'}
                        onClick={() => handleLaunchBattle(d)}
                        disabled={isLaunching}
                        className={cn(
                          'h-8 gap-1.5 text-xs font-semibold shadow-2xs transition-all',
                          isTargetCurrent
                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                            : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-200 border border-amber-500/30'
                        )}
                      >
                        <SwordsIcon className="size-3.5" />
                        <span>
                          {isLaunching
                            ? '正在载入...'
                            : isTargetCurrent
                            ? '前往评测打擂'
                            : `对齐切换至「${d.target_project_name}」打擂`}
                        </span>
                        <ArrowRightIcon className="size-3" />
                      </Button>
                    </div>
                  </div>

                  {/* 第二行：原材料文档依赖矩阵（可点击直接查看切片正文！） */}
                  <div className="rounded-lg bg-muted/40 p-3 border border-border/50 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileTextIcon className="size-3.5 text-indigo-500 shrink-0" />
                        <span className="font-medium text-foreground">
                          评测原材料文档依赖 ({d.source_docs.length} 篇):
                        </span>
                        {d.source_docs.length === 0 ? (
                          <span className="text-[11px] text-muted-foreground">自由问答题库，无物理文档硬依赖</span>
                        ) : isTargetCurrent ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                            <CheckCircle2Icon className="size-3" /> 原材料契约对齐（点击文档名可查看正文）
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                            <AlertTriangleIcon className="size-3" /> 点击前往打擂将自动切至该项目就绪
                          </span>
                        )}
                      </div>

                      {d.source_docs.length > 0 && (
                        <button
                          onClick={() => toggleDocs(d.name)}
                          className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                        >
                          {isDocsExpanded ? '收起源材料' : '展开文档清单'}
                          {isDocsExpanded ? <ChevronUpIcon className="size-3" /> : <ChevronDownIcon className="size-3" />}
                        </button>
                      )}
                    </div>

                    {/* 展开的原材料文档 Tag 列表（每个 Tag 均支持点击打开查看切片和全文！） */}
                    {isDocsExpanded && d.source_docs.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2.5 pt-2 border-t border-border/40 animate-in fade-in duration-200">
                        {d.source_docs.map((doc, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleViewDocContent(doc, d.target_project_id, d.tenant_id)}
                            className="group/tag inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-background hover:bg-indigo-500/10 border border-border/70 hover:border-indigo-500/50 text-[11px] text-foreground font-mono transition-all cursor-pointer shadow-2xs hover:shadow-xs"
                            title="点击查看此文档解析出的全文与切片正文"
                          >
                            <FileTextIcon className="size-3 text-muted-foreground group-hover/tag:text-indigo-500 transition-colors" />
                            <span className="group-hover/tag:text-indigo-600 dark:group-hover/tag:text-indigo-400 transition-colors underline-offset-2 group-hover/tag:underline">
                              {doc}
                            </span>
                            <ExternalLinkIcon className="size-2.5 text-muted-foreground opacity-60 group-hover/tag:opacity-100 group-hover/tag:text-indigo-500" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 第三行：考题与指标抽样预览（像表格汇总中那样：支持点击查看、修改边界、查看支撑上下文！） */}
                  {d.sample_cases && d.sample_cases.length > 0 && (
                    <div className="text-xs">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-[11px]">
                          考题画像抽样（展示前 {d.sample_cases.length} 题标准问答 · 点击卡片检视详情与编辑切片边界）:
                        </span>
                        <button
                          onClick={() => toggleCases(d.name)}
                          className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                        >
                          {isCasesExpanded ? '收起考题预览' : '展开考题与切片证据'}
                          {isCasesExpanded ? <ChevronUpIcon className="size-3" /> : <ChevronDownIcon className="size-3" />}
                        </button>
                      </div>

                      {isCasesExpanded && (
                        <div className="space-y-2 mt-2 pt-2 border-t border-border/40 animate-in fade-in duration-200">
                          {d.sample_cases.map((sc, scIdx) => (
                            <div
                              key={sc.id || scIdx}
                              onClick={() => handleOpenCaseDetail(d.name, sc, scIdx)}
                              className="group/case p-3 rounded-lg bg-card hover:bg-muted/30 border border-border/60 hover:border-indigo-500/60 transition-all cursor-pointer shadow-2xs hover:shadow-xs text-[11px] space-y-1.5"
                              title="点击查看完整考题、修改切片边界及查看支撑上下文证据"
                            >
                              <div className="flex items-center justify-between text-muted-foreground">
                                <span className="font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                                  #{scIdx + 1} ({sc.id})
                                  <span className="text-[10px] font-normal px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-500">
                                    点击检视与修改切片 ↗
                                  </span>
                                </span>
                                <span className="text-muted-foreground group-hover/case:text-indigo-500 font-medium flex items-center gap-1">
                                  <span>支撑切片: {sc.context_count} 处</span>
                                  <Edit3Icon className="size-3" />
                                </span>
                              </div>
                              <div className="text-foreground font-medium leading-relaxed">
                                <span className="text-muted-foreground font-normal">问: </span>
                                {sc.question}
                              </div>
                              <div className="text-muted-foreground bg-muted/40 p-2 rounded-md font-mono text-[10.5px] leading-relaxed border border-border/40">
                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">标准答案: </span>
                                {sc.ground_truth}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 模态框 1：原材料文档全文与切片查看 (Document Content Modal) */}
      {/* ------------------------------------------------------------------- */}
      <Dialog open={Boolean(previewDocName)} onOpenChange={(open) => !open && setPreviewDocName(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-6 overflow-hidden">
          <DialogHeader className="flex-none border-b border-border/40 pb-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                  <FileTextIcon className="size-5" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-base font-semibold truncate text-foreground">
                    {previewDocName}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                    {previewDocData ? (
                      <>
                        <span>所属知识库: {previewDocData.project_id || '当前库'}</span>
                        <span>•</span>
                        <span>切片数: {previewDocData.chunks_count} 片</span>
                        <span>•</span>
                        <span>总字数: {previewDocData.full_content?.length || 0} 字符</span>
                      </>
                    ) : (
                      <span>正在定位底层切片与正文...</span>
                    )}
                  </DialogDescription>
                </div>
              </div>

              {previewDocData && (
                <div className="flex items-center gap-1 bg-muted p-1 rounded-lg shrink-0 text-xs">
                  <button
                    type="button"
                    onClick={() => setPreviewDocTab('chunks')}
                    className={cn(
                      'px-2.5 py-1 rounded-md transition-all font-medium',
                      previewDocTab === 'chunks'
                        ? 'bg-background text-foreground shadow-2xs font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    切片碎块 ({previewDocData.chunks_count})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewDocTab('full')}
                    className={cn(
                      'px-2.5 py-1 rounded-md transition-all font-medium',
                      previewDocTab === 'full'
                        ? 'bg-background text-foreground shadow-2xs font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    解析全文
                  </button>
                </div>
              )}
            </div>
          </DialogHeader>

          {/* 模态框正文 */}
          <div className="flex-1 overflow-y-auto min-h-0 py-3 text-xs">
            {previewDocLoading ? (
              <div className="h-64 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2Icon className="size-6 animate-spin text-emerald-500" />
                <span>正在提取文档切片正文...</span>
              </div>
            ) : !previewDocData || (!previewDocData.full_content && previewDocData.chunks_count === 0) ? (
              <div className="p-8 text-center space-y-2">
                <AlertTriangleIcon className="size-8 text-amber-500 mx-auto" />
                <p className="font-semibold text-foreground">未在知识库中找到物理文档或解析切片</p>
                <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                  文档「{previewDocName}」可能尚未上传，或当前正在跨库运行。请确认目标知识库已成功灌入该文档。
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 1. 多模态原始图片预览区域 */}
                {(previewDocData.is_media || (previewDocName && /\.(png|jpe?g|svg|webp|gif)$/i.test(previewDocName))) && (
                  <div className="p-3 rounded-xl bg-slate-950/5 dark:bg-slate-900/40 border border-border/50">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-2 px-1">
                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                        <ImageIcon className="size-3.5 text-blue-500" /> 多模态原始图像预览
                      </span>
                      <a
                        href={`/ops/documents/${encodeURIComponent(previewDocName!)}/raw`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline flex items-center gap-1 text-[11px]"
                      >
                        在新标签页打开原图 ↗
                      </a>
                    </div>
                    <div className="flex items-center justify-center p-3 bg-background/60 rounded-lg border border-border/40 overflow-hidden min-h-[140px] max-h-[300px]">
                      <img
                        src={`/ops/documents/${encodeURIComponent(previewDocName!)}/raw`}
                        alt={previewDocName!}
                        className="max-h-[270px] w-auto max-w-full object-contain rounded shadow-xs"
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = 'none'
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* 2. 题库自带支撑切片透明提示条 (未灌库文档) */}
                {previewDocData.is_synthetic_context && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs flex items-start gap-2.5">
                    <AlertCircleIcon className="size-4 shrink-0 text-amber-500 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground flex items-center gap-1.5">
                        <span>💡 题库自带支撑切片</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 font-mono">
                          未在知识库灌库原件
                        </span>
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {previewDocData.notice || `该文档尚未在当前知识库中灌库物理原件，以下内容自动提取自题库中引用该文档的 ${previewDocData.chunks_count} 条支撑上下文切片。`}
                      </p>
                    </div>
                  </div>
                )}

                {/* 3. 碎块与全文内容切换展示 */}
                {previewDocTab === 'chunks' ? (
                  <div className="space-y-3">
                    {previewDocData.chunks.map((ch, idx) => (
                      <div
                        key={ch.chunk_id || idx}
                        className="p-3 rounded-lg bg-muted/30 border border-border/50 text-[11px] font-mono space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-muted-foreground border-b border-border/30 pb-1.5">
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            #{idx + 1} ({ch.chunk_id})
                          </span>
                          <div className="flex items-center gap-2">
                            <span>{ch.tokens || ch.content.length} 词元/字符</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopyText(ch.content, ch.chunk_id)}
                              className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground gap-1"
                            >
                              {copiedDocId === ch.chunk_id ? <CheckIcon className="size-3 text-emerald-500" /> : <CopyIcon className="size-3" />}
                              <span>{copiedDocId === ch.chunk_id ? '已复制' : '复制切片'}</span>
                            </Button>
                          </div>
                        </div>
                        <div className="whitespace-pre-wrap break-words leading-relaxed text-foreground/90 font-mono">
                          {ch.content}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3.5 rounded-lg bg-muted/20 border border-border/50 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words">
                    {previewDocData.full_content}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="flex-none border-t border-border/40 pt-3">
            <Button size="sm" onClick={() => setPreviewDocName(null)}>
              关闭预览
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------------- */}
      {/* 模态框 2：考题 Case 详情检视、修改边界与上下文证据编辑 (Case Detail Modal) */}
      {/* ------------------------------------------------------------------- */}
      <Dialog open={Boolean(inspectCase)} onOpenChange={(open) => !open && setInspectCase(null)}>
        <DialogContent className="sm:max-w-[680px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileTextIcon className="size-4 text-indigo-500" />
              <span>考题用例检视与切片边界编辑 ({inspectCase?.caseItem.id})</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              检视考题的标准问答、黄金答案以及底层提取的支撑上下文证据；可在线修改切片边界并持久化保存。
            </DialogDescription>
          </DialogHeader>

          {inspectCase && (
            <div className="space-y-4 py-2 text-xs">
              {/* 1. 提问内容 */}
              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground uppercase text-[11px]">
                  提问内容 (Question / Query)
                </label>
                <div className="p-3 rounded-lg bg-muted/40 font-medium text-foreground leading-relaxed border border-border/50">
                  {inspectCase.caseItem.question}
                </div>
              </div>

              {/* 2. 黄金标准答案 */}
              <div className="space-y-1">
                <label className="font-semibold text-emerald-600 dark:text-emerald-400 uppercase text-[11px]">
                  黄金标准答案 (Ground Truth)
                </label>
                <div className="p-3 rounded-lg bg-emerald-500/5 font-mono text-foreground leading-relaxed border border-emerald-500/20">
                  {inspectCase.caseItem.ground_truth}
                </div>
              </div>

              {/* 3. 支撑上下文与切片证据 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-muted-foreground uppercase text-[11px] flex items-center gap-1.5">
                    <span>支撑上下文与切片证据 (Contexts & Sources)</span>
                    {inspectCase.caseItem.contexts && inspectCase.caseItem.contexts.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-600 font-mono">
                        {inspectCase.caseItem.contexts.length} 个支撑切片
                      </span>
                    )}
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditingContext(!isEditingContext)}
                    className="h-6 px-2 text-[11px] gap-1 text-indigo-600 dark:text-indigo-400 font-medium"
                  >
                    <Edit3Icon className="size-3" />
                    <span>{isEditingContext ? '取消编辑' : '在线修改切片边界'}</span>
                  </Button>
                </div>

                {isEditingContext ? (
                  <div className="space-y-2 animate-in fade-in duration-200">
                    <textarea
                      value={editingContextText}
                      onChange={(e) => setEditingContextText(e.target.value)}
                      rows={7}
                      placeholder="在此修改或微调该考题的底层支撑切片文本边界..."
                      className="w-full text-xs font-mono p-2.5 rounded-lg border border-indigo-500/50 bg-background focus:outline-hidden focus:ring-1 focus:ring-indigo-500 leading-relaxed resize-y"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">
                        提示：点击确认将立即回写持久化至所属题库文件「{inspectCase.datasetName}」
                      </span>
                      <Button
                        size="sm"
                        disabled={savingCase}
                        onClick={handleSaveCaseContext}
                        className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
                      >
                        {savingCase ? <Loader2Icon className="size-3 animate-spin" /> : <CheckCircle2Icon className="size-3.5" />}
                        <span>{savingCase ? '正在落盘...' : '确认并保存修改'}</span>
                      </Button>
                    </div>
                  </div>
                ) : inspectCase.caseItem.contexts && inspectCase.caseItem.contexts.length > 0 ? (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {inspectCase.caseItem.contexts.map((ctxText, idx) => (
                      <div
                        key={idx}
                        onClick={() => setFocusSlice({ index: idx + 1, text: ctxText })}
                        className="group/slice p-2.5 rounded-md bg-muted/30 hover:bg-muted/60 font-mono text-[11px] text-foreground/90 leading-relaxed border border-border/40 hover:border-indigo-500/70 transition-all cursor-pointer select-text shadow-2xs"
                        title="点击全屏放大检视该切片完整内容"
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
                            <span>点击放大</span>
                          </span>
                        </div>
                        <div className="whitespace-pre-wrap break-words">{ctxText}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3.5 rounded-lg bg-amber-500/5 border border-amber-500/20 text-muted-foreground text-xs space-y-1.5">
                    <div className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400 text-xs">
                      <InfoIcon className="size-4 shrink-0" />
                      <span>该考题暂未保存独立的支撑切片文本</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      点击右上角<b>「在线修改切片边界」</b>可立即手工补充证据文本，或直接在打擂台运行评测。
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="pt-2 flex items-center justify-between">
            <div className="text-[11px] text-muted-foreground">
              {inspectCase && (
                <span>归属题库: <strong className="text-foreground">{inspectCase.datasetName}</strong></span>
              )}
            </div>
            <Button size="sm" onClick={() => setInspectCase(null)}>
              关闭检视
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------------- */}
      {/* 模态框 3：切片放大全屏检视 (Focus Slice Modal) */}
      {/* ------------------------------------------------------------------- */}
      <Dialog open={Boolean(focusSlice)} onOpenChange={(open) => !open && setFocusSlice(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-6">
          <DialogHeader className="border-b border-border/40 pb-3">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
              <Maximize2Icon className="size-4 text-indigo-500" />
              <span>切片 #{focusSlice?.index} 证据全文检视</span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0 py-3">
            <div className="p-3.5 rounded-lg bg-muted/30 border border-border/50 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-foreground">
              {focusSlice?.text}
            </div>
          </div>
          <DialogFooter className="border-t border-border/40 pt-3 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => focusSlice && handleCopyText(focusSlice.text, 'focus-slice')}
              className="h-8 gap-1.5 text-xs"
            >
              {copiedDocId === 'focus-slice' ? <CheckIcon className="size-3 text-emerald-500" /> : <CopyIcon className="size-3" />}
              <span>{copiedDocId === 'focus-slice' ? '已复制' : '复制切片全文'}</span>
            </Button>
            <Button size="sm" onClick={() => setFocusSlice(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
