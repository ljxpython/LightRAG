import React, { useState, useEffect, useMemo } from 'react'
import {
  X,
  Scale,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Layers,
  Filter
} from 'lucide-react'

export interface CompareTargetItem {
  task_id: string
  mode?: string
  label?: string
}

interface MetricDiffItem {
  baseline: number
  comparison: number
  delta: number
  percentage_delta: number
}

interface CaseComparisonItem {
  case_index: number
  query: string
  ground_truth: string
  verdict: 'comparison_won' | 'baseline_won' | 'tie' | 'regressed' | 'improved'
  score_delta: number
  baseline: {
    mode: string
    score: number
    all_passed: boolean
    actual_output: string
    answer?: string
    scores: Record<string, number>
    reasons: Record<string, string>
    sources_count: number
    sources: any[]
    durations: { total: number; rag: number; judge: number }
    trace_url?: string
  }
  comparison: {
    mode: string
    score: number
    all_passed: boolean
    actual_output: string
    answer?: string
    scores: Record<string, number>
    reasons: Record<string, string>
    sources_count: number
    sources: any[]
    durations: { total: number; rag: number; judge: number }
    trace_url?: string
  }
  diff_attribution: {
    jaccard_similarity: number
    shared_sources_count: number
    baseline_unique_sources_count: number
    comparison_unique_sources_count: number
    baseline_unique_sources: any[]
    comparison_unique_sources: any[]
    shared_sources: any[]
  }
}

interface ComparisonData {
  status: string
  baseline_target: string
  comparison_target: string
  targets: Array<{
    task_id: string
    mode?: string
    label: string
    overall_score?: number
    pass_rate?: number
    dataset_name?: string
    timing?: {
      total_duration_seconds: number
      avg_case_duration_seconds: number
      avg_rag_duration_seconds: number
      avg_judge_duration_seconds: number
    }
  }>
  macro_summary: {
    overall_score: { baseline: number; comparison: number; delta: number }
    pass_rate: { baseline: number; comparison: number; delta: number }
    metrics: Record<string, MetricDiffItem>
    timing: {
      baseline: Record<string, number>
      comparison: Record<string, number>
    }
    win_tie_loss: {
      total_cases: number
      comparison_won: number
      baseline_won: number
      tie: number
      regressed: number
      improved: number
    }
  }
  case_comparisons: CaseComparisonItem[]
  decision_recommendation: string
}

interface Props {
  isOpen: boolean
  onClose: () => void
  targets: CompareTargetItem[]
  availableRuns?: any[]
  onTargetsChange?: (newTargets: CompareTargetItem[]) => void
}

const METRIC_LABELS: Record<string, string> = {
  faithfulness: '忠实度 (Faithfulness)',
  answer_relevancy: '回答相关性 (Relevancy)',
  contextual_recall: '检索召回率 (Recall)',
  contextual_precision: '检索精确率 (Precision)',
  counterfactual: '反事实抵抗力 (Counterfactual)'
}

export const EvaluationComparisonModal: React.FC<Props> = ({
  isOpen,
  onClose,
  targets,
  availableRuns = [],
  onTargetsChange
}) => {
  const [activeTab, setActiveTab] = useState<'macro' | 'cases' | 'performance'>('macro')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ComparisonData | null>(null)
  const [currentTargets, setCurrentTargets] = useState<CompareTargetItem[]>(targets)
  const [caseFilter, setCaseFilter] = useState<'all' | 'diff' | 'comp_won' | 'base_won' | 'tie' | 'regressed'>('all')
  const [expandedCaseIdx, setExpandedCaseIdx] = useState<number | null>(null)

  // 当外部 targets 变化时同步
  useEffect(() => {
    if (targets && targets.length >= 2) {
      setCurrentTargets(targets)
    }
  }, [targets])

  // 生成所有可供对比的历史打擂选项 (下拉列表)
  const runSelectOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string; scoreText: string }> = []
    availableRuns.forEach((r) => {
      const modes = r.modes && r.modes.length > 0 ? r.modes : ['mix']
      modes.forEach((m: string) => {
        const sc = typeof r.overall_score === 'number'
          ? (r.overall_score > 1 ? r.overall_score : r.overall_score * 100).toFixed(1)
          : '--'
        opts.push({
          value: `${r.task_id}::${m}`,
          label: `打擂 #${r.task_id.slice(-8)} (${m}) - ${r.dataset_name || '题库'} [${sc}分]`,
          scoreText: `${sc}分`
        })
      })
    })
    return opts
  }, [availableRuns])

  // 加载对比数据
  useEffect(() => {
    if (!isOpen || currentTargets.length < 2) return
    const fetchComparison = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/ops/evaluation/runs/compare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targets: currentTargets })
        })
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.detail || `请求失败 (${res.status})`)
        }
        const json: ComparisonData = await res.json()
        setData(json)
      } catch (e: any) {
        setError(e.message || '加载对比数据失败')
      } finally {
        setLoading(false)
      }
    }
    fetchComparison()
  }, [isOpen, currentTargets])

  // 处理基准组下拉切换
  const handleBaselineChange = (val: string) => {
    const [tId, m] = val.split('::')
    const opt = runSelectOptions.find((o) => o.value === val)
    const newTargets = [
      { task_id: tId, mode: m, label: opt ? opt.label.split(' - ')[0] : `打擂 #${tId.slice(-8)} (${m})` },
      currentTargets[1] || currentTargets[0]
    ]
    setCurrentTargets(newTargets)
    onTargetsChange?.(newTargets)
  }

  // 处理对比组下拉切换
  const handleComparisonChange = (val: string) => {
    const [tId, m] = val.split('::')
    const opt = runSelectOptions.find((o) => o.value === val)
    const newTargets = [
      currentTargets[0],
      { task_id: tId, mode: m, label: opt ? opt.label.split(' - ')[0] : `打擂 #${tId.slice(-8)} (${m})` }
    ]
    setCurrentTargets(newTargets)
    onTargetsChange?.(newTargets)
  }

  // 对调基准与对比
  const handleSwapTargets = () => {
    if (currentTargets.length < 2) return
    const swapped = [currentTargets[1], currentTargets[0], ...currentTargets.slice(2)]
    setCurrentTargets(swapped)
    onTargetsChange?.(swapped)
  }

  // 过滤后的用例列表
  const filteredCases = useMemo(() => {
    if (!data?.case_comparisons) return []
    return data.case_comparisons.filter((c) => {
      if (caseFilter === 'all') return true
      if (caseFilter === 'diff') return c.verdict !== 'tie'
      if (caseFilter === 'comp_won') return c.verdict === 'comparison_won' || c.verdict === 'improved'
      if (caseFilter === 'base_won') return c.verdict === 'baseline_won' || c.verdict === 'regressed'
      if (caseFilter === 'tie') return c.verdict === 'tie'
      if (caseFilter === 'regressed') return c.verdict === 'regressed'
      return true
    })
  }, [data, caseFilter])

  if (!isOpen) return null

  // 五维雷达图 SVG 渲染计算 (半径 R=90, 中心 130, 130)
  const renderRadarChart = () => {
    if (!data?.macro_summary?.metrics) return null
    const metricsOrder = ['faithfulness', 'answer_relevancy', 'contextual_recall', 'contextual_precision', 'counterfactual']
    const center = 130
    const maxR = 90
    const totalAxes = metricsOrder.length
    const angleStep = (Math.PI * 2) / totalAxes

    const getPolygonPoints = (isComp: boolean) => {
      return metricsOrder.map((key, i) => {
        const item = data.macro_summary.metrics[key]
        let val = isComp ? item?.comparison : item?.baseline
        if (val === undefined || val === null) val = 0
        if (val > 1) val = val / 100
        val = Math.max(0, Math.min(1, val))
        const angle = i * angleStep - Math.PI / 2
        const r = val * maxR
        const x = center + r * Math.cos(angle)
        const y = center + r * Math.sin(angle)
        return `${x.toFixed(1)},${y.toFixed(1)}`
      }).join(' ')
    }

    const baselinePoints = getPolygonPoints(false)
    const comparisonPoints = getPolygonPoints(true)
    const gridLevels = [0.25, 0.5, 0.75, 1.0]

    return (
      <div className="flex flex-col items-center">
        <svg width="270" height="260" className="overflow-visible select-none">
          {gridLevels.map((lvl, lIdx) => {
            const pts = metricsOrder.map((_, i) => {
              const angle = i * angleStep - Math.PI / 2
              const r = lvl * maxR
              return `${(center + r * Math.cos(angle)).toFixed(1)},${(center + r * Math.sin(angle)).toFixed(1)}`
            }).join(' ')
            return (
              <polygon
                key={lIdx}
                points={pts}
                fill="none"
                stroke="#e2e8f0"
                strokeWidth={lvl === 1 ? '1.5' : '1'}
                strokeDasharray={lvl === 1 ? 'none' : '3 3'}
              />
            )
          })}
          {metricsOrder.map((_, i) => {
            const angle = i * angleStep - Math.PI / 2
            const x = center + maxR * Math.cos(angle)
            const y = center + maxR * Math.sin(angle)
            return <line key={i} x1={center} y1={center} x2={x} y2={y} stroke="#cbd5e1" strokeWidth="1" />
          })}

          <polygon
            points={baselinePoints}
            fill="rgba(99, 102, 241, 0.22)"
            stroke="#6366f1"
            strokeWidth="2.5"
            className="transition-all duration-300"
          />

          <polygon
            points={comparisonPoints}
            fill="rgba(16, 185, 129, 0.25)"
            stroke="#10b981"
            strokeWidth="2.5"
            className="transition-all duration-300"
          />

          {metricsOrder.map((k, i) => {
            const angle = i * angleStep - Math.PI / 2
            const labelR = maxR + 22
            const x = center + labelR * Math.cos(angle)
            const y = center + labelR * Math.sin(angle)
            const shortName = k === 'faithfulness' ? '忠实度' : k === 'answer_relevancy' ? '相关性' : k === 'contextual_recall' ? '召回率' : k === 'contextual_precision' ? '精确率' : '反事实'
            return (
              <text
                key={i}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="11"
                fontWeight="500"
                fill="#475569"
              >
                {shortName}
              </text>
            )
          })}
        </svg>

        <div className="flex items-center gap-6 mt-2 text-xs font-medium">
          <div className="flex items-center gap-1.5 text-indigo-600">
            <span className="w-3 h-3 rounded-full bg-indigo-500 inline-block shadow-xs"></span>
            <span>基准: {data.baseline_target}</span>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-600">
            <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block shadow-xs"></span>
            <span>对比: {data.comparison_target}</span>
          </div>
        </div>
      </div>
    )
  }

  const baselineSelectVal = currentTargets[0] ? `${currentTargets[0].task_id}::${currentTargets[0].mode || ''}` : ''
  const comparisonSelectVal = currentTargets[1] ? `${currentTargets[1].task_id}::${currentTargets[1].mode || ''}` : ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center text-white shadow-md shadow-indigo-100">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-800">评测多维横向对撞与回溯工坊</h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-600 border border-indigo-100">
                  Head-to-Head PK
                </span>
              </div>
              <p className="text-xs text-slate-500">深入对撞不同检索模式或历史版本在五维指标、微观切片与答案论据上的根本差异</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSwapTargets}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title="对调基准组与对比组位置"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-slate-400" />
              <span>对调基准</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 智能选型建议横幅 */}
        {data?.decision_recommendation && (
          <div className="px-6 py-2.5 bg-gradient-to-r from-amber-50/80 via-indigo-50/50 to-emerald-50/80 border-b border-slate-100 flex items-center gap-2.5 text-xs text-slate-700">
            <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span className="font-semibold text-slate-800 flex-shrink-0">老王工程建议:</span>
            <span className="leading-relaxed">{data.decision_recommendation}</span>
          </div>
        )}

        {/* Tab 导航栏与动态切换打擂下拉框 */}
        <div className="flex items-center justify-between px-6 border-b border-slate-100 bg-white py-2">
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab('macro')}
              className={`py-2 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
                activeTab === 'macro'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span>宏观概览对决</span>
            </button>
            <button
              onClick={() => setActiveTab('cases')}
              className={`py-2 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
                activeTab === 'cases'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>用例胜负榜 (Side-by-Side Diff)</span>
              {data?.case_comparisons && (
                <span className="px-1.5 py-0.2 rounded-full text-xs bg-slate-100 text-slate-600">
                  {data.case_comparisons.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('performance')}
              className={`py-2 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
                activeTab === 'performance'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>性能与时延剖析</span>
            </button>
          </div>

          {/* 🌟 核心：支持任意打擂快速切换的下拉选择器 */}
          {runSelectOptions.length > 0 ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400 font-medium">基准:</span>
              <select
                value={baselineSelectVal}
                onChange={(e) => handleBaselineChange(e.target.value)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500 max-w-[210px] truncate"
                title="选择基准打擂"
              >
                {runSelectOptions.map((opt) => (
                  <option key={`base-${opt.value}`} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <span className="text-slate-400 font-bold px-1">VS</span>

              <span className="text-slate-400 font-medium">对比:</span>
              <select
                value={comparisonSelectVal}
                onChange={(e) => handleComparisonChange(e.target.value)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500 max-w-[210px] truncate"
                title="选择对比打擂"
              >
                {runSelectOptions.map((opt) => (
                  <option key={`comp-${opt.value}`} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ) : data ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-1 rounded bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100">
                {data.baseline_target}
              </span>
              <span className="text-slate-400 font-bold">VS</span>
              <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-100">
                {data.comparison_target}
              </span>
            </div>
          ) : null}
        </div>

        {/* 弹窗主体内容区 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && (
            <div className="py-24 flex flex-col items-center justify-center text-slate-400 space-y-3">
              <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm">正在深度对撞两组打擂全量切片与指标数据...</p>
            </div>
          )}

          {error && (
            <div className="p-6 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-500 mt-0.5" />
              <div>
                <p className="font-semibold">对比数据加载异常</p>
                <p className="text-xs text-red-600 mt-1">{error}</p>
              </div>
            </div>
          )}

          {!loading && !error && data && (
            <>
              {/* TAB 1: 宏观概览对决 */}
              {activeTab === 'macro' && (
                <div className="space-y-6">
                  {/* 核心战局统计卡片 */}
                  <div className="grid grid-cols-4 gap-4">
                    {/* 综合得分差异 */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                      <span className="text-xs font-medium text-slate-500">综合得分对撞</span>
                      <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-2xl font-black text-slate-800">
                          {((data.macro_summary.overall_score.comparison > 1 ? data.macro_summary.overall_score.comparison : data.macro_summary.overall_score.comparison * 100) || 0).toFixed(1)}分
                        </span>
                        <span className="text-xs text-slate-400">vs {((data.macro_summary.overall_score.baseline > 1 ? data.macro_summary.overall_score.baseline : data.macro_summary.overall_score.baseline * 100) || 0).toFixed(1)}分</span>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold">
                        {data.macro_summary.overall_score.delta >= 0 ? (
                          <span className="text-emerald-600 flex items-center gap-0.5">
                            <TrendingUp className="w-3.5 h-3.5" />
                            +{(data.macro_summary.overall_score.delta * 100).toFixed(1)}分 (增益)
                          </span>
                        ) : (
                          <span className="text-rose-600 flex items-center gap-0.5">
                            <TrendingDown className="w-3.5 h-3.5" />
                            {(data.macro_summary.overall_score.delta * 100).toFixed(1)}分 (落后)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 通过率差异 */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                      <span className="text-xs font-medium text-slate-500">业务通过率对撞</span>
                      <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-2xl font-black text-slate-800">
                          {((data.macro_summary.pass_rate.comparison * 100) || 0).toFixed(0)}%
                        </span>
                        <span className="text-xs text-slate-400">vs {((data.macro_summary.pass_rate.baseline * 100) || 0).toFixed(0)}%</span>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold">
                        {data.macro_summary.pass_rate.delta >= 0 ? (
                          <span className="text-emerald-600 flex items-center gap-0.5">
                            <TrendingUp className="w-3.5 h-3.5" />
                            +{(data.macro_summary.pass_rate.delta * 100).toFixed(0)}% (领先)
                          </span>
                        ) : (
                          <span className="text-rose-600 flex items-center gap-0.5">
                            <TrendingDown className="w-3.5 h-3.5" />
                            {(data.macro_summary.pass_rate.delta * 100).toFixed(0)}% (下滑)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 胜负平战绩 */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                      <span className="text-xs font-medium text-slate-500">胜负平战况 (Win/Loss)</span>
                      <div className="flex items-center gap-3 mt-2">
                        <div className="flex items-center gap-1 text-emerald-600 font-bold text-lg">
                          <span>{data.macro_summary.win_tie_loss.comparison_won}</span>
                          <span className="text-xs font-normal text-slate-400">胜</span>
                        </div>
                        <div className="flex items-center gap-1 text-slate-500 font-bold text-lg">
                          <span>{data.macro_summary.win_tie_loss.tie}</span>
                          <span className="text-xs font-normal text-slate-400">平</span>
                        </div>
                        <div className="flex items-center gap-1 text-rose-600 font-bold text-lg">
                          <span>{data.macro_summary.win_tie_loss.baseline_won}</span>
                          <span className="text-xs font-normal text-slate-400">负</span>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-slate-500 font-medium">
                        共 {data.macro_summary.win_tie_loss.total_cases} 道题目全面对撞
                      </div>
                    </div>

                    {/* 严重退化回归预警 */}
                    <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200/80">
                      <span className="text-xs font-medium text-amber-700">退化预警 (Regressed)</span>
                      <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-2xl font-black text-amber-900">
                          {data.macro_summary.win_tie_loss.regressed} 道
                        </span>
                      </div>
                      <div className="mt-2 text-xs font-medium text-amber-700 flex items-center gap-1">
                        {data.macro_summary.win_tie_loss.regressed > 0 ? (
                          <span className="text-rose-600 font-bold flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" /> 存在原本通过却翻车的题目
                          </span>
                        ) : (
                          <span className="text-emerald-600 font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> 零退化用例，安全可靠
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 核心可视化两列对撞区 */}
                  <div className="grid grid-cols-12 gap-6">
                    {/* 左侧：五维指标雷达图 */}
                    <div className="col-span-5 p-5 rounded-xl border border-slate-200 bg-white shadow-xs flex flex-col items-center">
                      <div className="w-full flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-700">五维质量雷达拓扑</span>
                        <span className="text-xs text-slate-400">0 ~ 100 综合分</span>
                      </div>
                      {renderRadarChart()}
                    </div>

                    {/* 右侧：五维指标差异矩阵表 */}
                    <div className="col-span-7 p-5 rounded-xl border border-slate-200 bg-white shadow-xs">
                      <div className="w-full flex items-center justify-between mb-4">
                        <span className="text-xs font-bold text-slate-700">质检核心指标差分矩阵</span>
                        <span className="text-xs text-slate-400">正向绿色表示对比组更优</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-slate-100 text-slate-400 font-medium">
                              <th className="py-2 px-3">指标维度</th>
                              <th className="py-2 px-3 text-indigo-600">基准 (A)</th>
                              <th className="py-2 px-3 text-emerald-600">对比 (B)</th>
                              <th className="py-2 px-3 text-right">差值 Δ</th>
                              <th className="py-2 px-3 text-right">相对幅度</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {Object.entries(data.macro_summary.metrics || {}).map(([mk, diff]) => {
                              const isPositive = diff.delta > 0
                              const isZero = diff.delta === 0
                              const bVal = (diff.baseline > 1 ? diff.baseline : diff.baseline * 100).toFixed(1)
                              const cVal = (diff.comparison > 1 ? diff.comparison : diff.comparison * 100).toFixed(1)
                              const dVal = (diff.delta > 1 ? diff.delta : diff.delta * 100).toFixed(1)
                              return (
                                <tr key={mk} className="hover:bg-slate-50/70 transition-colors">
                                  <td className="py-2.5 px-3 font-semibold text-slate-700">
                                    {METRIC_LABELS[mk] || mk}
                                  </td>
                                  <td className="py-2.5 px-3 font-medium text-slate-600">{bVal}分</td>
                                  <td className="py-2.5 px-3 font-medium text-slate-800">{cVal}分</td>
                                  <td className="py-2.5 px-3 text-right font-bold">
                                    {isZero ? (
                                      <span className="text-slate-400">-</span>
                                    ) : isPositive ? (
                                      <span className="text-emerald-600">+{dVal}分</span>
                                    ) : (
                                      <span className="text-rose-600">{dVal}分</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-medium">
                                    {isZero ? (
                                      <span className="text-slate-400">0%</span>
                                    ) : isPositive ? (
                                      <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-xs font-semibold">
                                        +{diff.percentage_delta}%
                                      </span>
                                    ) : (
                                      <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 text-xs font-semibold">
                                        {diff.percentage_delta}%
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: 用例胜负榜 (Side-by-Side Diff) */}
              {activeTab === 'cases' && (
                <div className="space-y-4">
                  {/* 筛选过滤工具条 */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Filter className="w-4 h-4 text-slate-400" />
                      <span className="text-xs font-semibold text-slate-600">用例状态过滤:</span>
                      <div className="flex gap-1.5 text-xs">
                        {[
                          { id: 'all', label: `全部 (${data.case_comparisons.length})` },
                          { id: 'diff', label: '仅看分歧题' },
                          { id: 'comp_won', label: `对比组优胜 (${data.macro_summary.win_tie_loss.comparison_won})` },
                          { id: 'base_won', label: `基准组优胜 (${data.macro_summary.win_tie_loss.baseline_won})` },
                          { id: 'regressed', label: `严重退化 ⚠️ (${data.macro_summary.win_tie_loss.regressed})` },
                          { id: 'tie', label: `平局 (${data.macro_summary.win_tie_loss.tie})` }
                        ].map((f) => (
                          <button
                            key={f.id}
                            onClick={() => setCaseFilter(f.id as any)}
                            className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                              caseFilter === f.id
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <span className="text-xs text-slate-400">点击用例展开双列切片与文本深度 Diff</span>
                  </div>

                  {/* 用例列表 */}
                  <div className="space-y-3">
                    {filteredCases.map((c) => {
                      const isExpanded = expandedCaseIdx === c.case_index
                      const bScore = (c.baseline.score > 1 ? c.baseline.score : c.baseline.score * 100).toFixed(0)
                      const cScore = (c.comparison.score > 1 ? c.comparison.score : c.comparison.score * 100).toFixed(0)
                      const diffAtt = c.diff_attribution

                      return (
                        <div
                          key={c.case_index}
                          className={`rounded-xl border transition-all ${
                            c.verdict === 'regressed'
                              ? 'border-rose-200 bg-rose-50/20'
                              : c.verdict === 'comparison_won' || c.verdict === 'improved'
                              ? 'border-emerald-200 bg-emerald-50/20'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div
                            onClick={() => setExpandedCaseIdx(isExpanded ? null : c.case_index)}
                            className="p-4 flex items-center justify-between cursor-pointer select-none"
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
                              <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-600 font-bold text-xs flex items-center justify-center flex-shrink-0">
                                #{c.case_index}
                              </span>

                              {c.verdict === 'regressed' && (
                                <span className="px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-1 flex-shrink-0">
                                  <AlertTriangle className="w-3 h-3" /> 严重退化
                                </span>
                              )}
                              {c.verdict === 'improved' && (
                                <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1 flex-shrink-0">
                                  <CheckCircle2 className="w-3 h-3" /> 逆袭通过
                                </span>
                              )}
                              {c.verdict === 'comparison_won' && (
                                <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 flex-shrink-0">
                                  对比组优胜 (+{((c.score_delta > 1 ? c.score_delta : c.score_delta * 100)).toFixed(0)}分)
                                </span>
                              )}
                              {c.verdict === 'baseline_won' && (
                                <span className="px-2 py-0.5 rounded text-xs font-bold bg-indigo-50 text-indigo-600 border border-indigo-200 flex-shrink-0">
                                  基准组优胜 (+{((-c.score_delta > 1 ? -c.score_delta : -c.score_delta * 100)).toFixed(0)}分)
                                </span>
                              )}
                              {c.verdict === 'tie' && (
                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500 flex-shrink-0">
                                  平局
                                </span>
                              )}

                              <p className="text-xs font-semibold text-slate-800 truncate" title={c.query}>
                                {c.query}
                              </p>
                            </div>

                            <div className="flex items-center gap-4 flex-shrink-0">
                              <div className="px-2 py-1 rounded bg-slate-100 text-slate-600 text-xs font-medium flex items-center gap-1.5" title="切片 Jaccard 相似度">
                                <Layers className="w-3 h-3 text-slate-400" />
                                <span>切片重合: {(diffAtt.jaccard_similarity * 100).toFixed(0)}%</span>
                              </div>

                              <div className="text-xs font-bold flex items-center gap-1.5">
                                <span className="text-indigo-600">{bScore}分</span>
                                <span className="text-slate-300">/</span>
                                <span className="text-emerald-600">{cScore}分</span>
                              </div>

                              {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="px-4 pb-4 border-t border-slate-100 pt-4 space-y-4">
                              {c.ground_truth && (
                                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                                  <span className="font-bold text-slate-500 block mb-1">🎯 标杆答案 (Ground Truth):</span>
                                  <p className="text-slate-700 leading-relaxed">{c.ground_truth}</p>
                                </div>
                              )}

                              <div className="grid grid-cols-2 gap-4">
                                {/* 左列: 基准组 */}
                                <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/20 space-y-3">
                                  <div className="flex items-center justify-between pb-2 border-b border-indigo-100/60">
                                    <div className="flex items-center gap-2">
                                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                                      <span className="text-xs font-bold text-indigo-900">{data.baseline_target}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs">
                                      <span className="font-extrabold text-indigo-700">{bScore}分</span>
                                      {c.baseline.trace_url && (
                                        <a
                                          href={c.baseline.trace_url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-indigo-500 hover:text-indigo-700 inline-flex items-center gap-0.5"
                                        >
                                          Trace <ExternalLink className="w-3 h-3" />
                                        </a>
                                      )}
                                    </div>
                                  </div>

                                  <div>
                                    <div className="flex items-center justify-between mb-1 text-xs">
                                      <span className="font-semibold text-slate-700">
                                        召回切片 ({c.baseline.sources_count}个):
                                      </span>
                                      <span className="text-slate-400 text-[11px]">
                                        共有 {diffAtt.shared_sources_count} • 独占 {diffAtt.baseline_unique_sources_count}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 rounded bg-white border border-slate-200">
                                      {c.baseline.sources.map((s, sIdx) => {
                                        const isShared = diffAtt.shared_sources.some((ss) => (ss.chunk_id || ss.title) === (s.chunk_id || s.title))
                                        return (
                                          <span
                                            key={sIdx}
                                            className={`px-1.5 py-0.5 rounded text-[11px] font-medium border ${
                                              isShared
                                                ? 'bg-slate-50 text-slate-600 border-slate-200'
                                                : 'bg-indigo-50 text-indigo-700 border-indigo-200 font-bold'
                                            }`}
                                            title={s.preview || s.title || JSON.stringify(s)}
                                          >
                                            {isShared ? '共有: ' : 'A独占: '}{s.title || (s.chunk_id ? s.chunk_id.slice(-8) : `Chunk ${sIdx + 1}`)}
                                          </span>
                                        )
                                      })}
                                    </div>
                                  </div>

                                  <div>
                                    <span className="font-semibold text-slate-700 text-xs block mb-1">模型回答输出:</span>
                                    <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">
                                      {(c.baseline as any).actual_output || (c.baseline as any).answer || '<无输出>'}
                                    </div>
                                  </div>

                                  {Object.keys(c.baseline.reasons).length > 0 && (
                                    <div className="text-xs text-slate-600 p-2 rounded bg-slate-50 border border-slate-200/60">
                                      <span className="font-bold text-slate-700 block mb-1">裁判理由:</span>
                                      {Object.entries(c.baseline.reasons).map(([rk, rv]) => (
                                        <p key={rk} className="text-[11px] text-slate-500 mb-0.5">
                                          <span className="font-semibold text-slate-700">[{rk}]</span> {rv}
                                        </p>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* 右列: 对比组 */}
                                <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/20 space-y-3">
                                  <div className="flex items-center justify-between pb-2 border-b border-emerald-100/60">
                                    <div className="flex items-center gap-2">
                                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                                      <span className="text-xs font-bold text-emerald-900">{data.comparison_target}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs">
                                      <span className="font-extrabold text-emerald-700">{cScore}分</span>
                                      {c.comparison.trace_url && (
                                        <a
                                          href={c.comparison.trace_url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-emerald-500 hover:text-emerald-700 inline-flex items-center gap-0.5"
                                        >
                                          Trace <ExternalLink className="w-3 h-3" />
                                        </a>
                                      )}
                                    </div>
                                  </div>

                                  <div>
                                    <div className="flex items-center justify-between mb-1 text-xs">
                                      <span className="font-semibold text-slate-700">
                                        召回切片 ({c.comparison.sources_count}个):
                                      </span>
                                      <span className="text-slate-400 text-[11px]">
                                        共有 {diffAtt.shared_sources_count} • 独占 {diffAtt.comparison_unique_sources_count}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 rounded bg-white border border-slate-200">
                                      {c.comparison.sources.map((s, sIdx) => {
                                        const isShared = diffAtt.shared_sources.some((ss) => (ss.chunk_id || ss.title) === (s.chunk_id || s.title))
                                        return (
                                          <span
                                            key={sIdx}
                                            className={`px-1.5 py-0.5 rounded text-[11px] font-medium border ${
                                              isShared
                                                ? 'bg-slate-50 text-slate-600 border-slate-200'
                                                : 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold'
                                            }`}
                                            title={s.preview || s.title || JSON.stringify(s)}
                                          >
                                            {isShared ? '共有: ' : 'B独占: '}{s.title || (s.chunk_id ? s.chunk_id.slice(-8) : `Chunk ${sIdx + 1}`)}
                                          </span>
                                        )
                                      })}
                                    </div>
                                  </div>

                                  <div>
                                    <span className="font-semibold text-slate-700 text-xs block mb-1">模型回答输出:</span>
                                    <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">
                                      {(c.comparison as any).actual_output || (c.comparison as any).answer || '<无输出>'}
                                    </div>
                                  </div>

                                  {Object.keys(c.comparison.reasons).length > 0 && (
                                    <div className="text-xs text-slate-600 p-2 rounded bg-slate-50 border border-slate-200/60">
                                      <span className="font-bold text-slate-700 block mb-1">裁判理由:</span>
                                      {Object.entries(c.comparison.reasons).map(([rk, rv]) => (
                                        <p key={rk} className="text-[11px] text-slate-500 mb-0.5">
                                          <span className="font-semibold text-slate-700">[{rk}]</span> {rv}
                                        </p>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* TAB 3: 性能与时延剖析 */}
              {activeTab === 'performance' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    {/* 基准组耗时拆解 */}
                    <div className="p-5 rounded-xl border border-indigo-100 bg-indigo-50/20 space-y-4">
                      <div className="flex items-center justify-between pb-2 border-b border-indigo-100">
                        <span className="text-sm font-bold text-indigo-900">{data.baseline_target} 耗时拓扑</span>
                        <span className="text-xs font-semibold text-indigo-600">
                          单题均耗: {data.macro_summary.timing.baseline.avg_case_duration_seconds > 0 ? `${data.macro_summary.timing.baseline.avg_case_duration_seconds}s` : '--'}
                        </span>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between text-slate-600">
                          <span>🔍 RAG 检索均耗:</span>
                          <span className="font-bold text-slate-800">
                            {data.macro_summary.timing.baseline.avg_rag_duration_seconds > 0 ? `${data.macro_summary.timing.baseline.avg_rag_duration_seconds}s` : '-- (未记录)'}
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>⚖️ 裁判大模型思考均耗:</span>
                          <span className="font-bold text-slate-800">
                            {data.macro_summary.timing.baseline.avg_judge_duration_seconds > 0 ? `${data.macro_summary.timing.baseline.avg_judge_duration_seconds}s` : '-- (未记录)'}
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>⏱️ 整场全量总耗时:</span>
                          <span className="font-bold text-slate-800">
                            {data.macro_summary.timing.baseline.total_duration_seconds > 0 ? `${data.macro_summary.timing.baseline.total_duration_seconds}s` : '--'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 对比组耗时拆解 */}
                    <div className="p-5 rounded-xl border border-emerald-100 bg-emerald-50/20 space-y-4">
                      <div className="flex items-center justify-between pb-2 border-b border-emerald-100">
                        <span className="text-sm font-bold text-emerald-900">{data.comparison_target} 耗时拓扑</span>
                        <span className="text-xs font-semibold text-emerald-600">
                          单题均耗: {data.macro_summary.timing.comparison.avg_case_duration_seconds > 0 ? `${data.macro_summary.timing.comparison.avg_case_duration_seconds}s` : '--'}
                        </span>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between text-slate-600">
                          <span>🔍 RAG 检索均耗:</span>
                          <span className="font-bold text-slate-800">
                            {data.macro_summary.timing.comparison.avg_rag_duration_seconds > 0 ? `${data.macro_summary.timing.comparison.avg_rag_duration_seconds}s` : '-- (未记录)'}
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>⚖️ 裁判大模型思考均耗:</span>
                          <span className="font-bold text-slate-800">
                            {data.macro_summary.timing.comparison.avg_judge_duration_seconds > 0 ? `${data.macro_summary.timing.comparison.avg_judge_duration_seconds}s` : '-- (未记录)'}
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>⏱️ 整场全量总耗时:</span>
                          <span className="font-bold text-slate-800">
                            {data.macro_summary.timing.comparison.total_duration_seconds > 0 ? `${data.macro_summary.timing.comparison.total_duration_seconds}s` : '--'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed">
                    <p className="font-bold text-slate-700 mb-1">⏱️ 耗时与真实度说明：</p>
                    <p>
                      如果当前历史打擂显示 “-- (未记录)”，是因为该场评测执行时底层尚未引入高精度 4 级 Span 树计时；新发起的评测将自动打标并精准记录 RAG 检索与裁判思考的毫秒级耗时。
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            支持 2 到 4 组任意打擂模式或版本纵向深度对撞
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            关闭工作台
          </button>
        </div>
      </div>
    </div>
  )
}
