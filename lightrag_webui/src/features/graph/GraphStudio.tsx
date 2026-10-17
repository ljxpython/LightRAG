import { useState, useMemo, useCallback, useEffect, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Network,
  Search,
  Sliders,
  Layers,
  Sparkles,
  Maximize2,
  Minimize2,
  RefreshCw,
  FileText,
  Tag,
  Hash,
  ChevronRight,
  ExternalLink,
  Info,
  CircleDot,
  Compass,
  Eye,
  Activity,
  Boxes
} from 'lucide-react'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { useGraphStore, RawNodeType, RawEdgeType } from '@/stores/graph'
import DocumentInspector from '@/components/documents/DocumentInspector'

const GraphViewer = lazy(() => import('@/features/GraphViewer'))
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/DropdownMenu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip'

export default function GraphStudio() {
  const { t } = useTranslation()
  const rawGraph = useGraphStore.use.rawGraph()
  const isFetching = useGraphStore.use.isFetching()
  const selectedNode = useGraphStore.use.selectedNode()
  const setSelectedNode = useGraphStore.use.setSelectedNode()
  const setFocusedNode = useGraphStore.use.setFocusedNode()
  const fetchGraph = useGraphStore.getState().fetchGraph

  const [searchQuery, setSearchQuery] = useState('')
  const [exploreDepth, setExploreDepth] = useState<1 | 2 | 3>(2)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'focused' | 'full'>('full')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // 1. 核心数据提取与统计
  const allNodes = useMemo(() => rawGraph?.nodes || [], [rawGraph])
  const allEdges = useMemo(() => rawGraph?.edges || [], [rawGraph])

  // 实体类型归类提取
  const categoryStats = useMemo(() => {
    const stats: Record<string, number> = {}
    for (const node of allNodes) {
      const type = node.labels?.[0] || 'Unknown'
      stats[type] = (stats[type] || 0) + 1
    }
    return stats
  }, [allNodes])

  const categories = useMemo(() => ['all', ...Object.keys(categoryStats)], [categoryStats])

  // 核心骨干实体 (Top 15 按连接度排序)
  const popularEntities = useMemo(() => {
    return [...allNodes]
      .sort((a, b) => (b.degree || 0) - (a.degree || 0))
      .slice(0, 15)
  }, [allNodes])

  // 实时搜索候选列表
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    return allNodes
      .filter((n) => n.id.toLowerCase().includes(q) || (n.labels && n.labels.some((l) => l.toLowerCase().includes(q))))
      .slice(0, 8)
  }, [allNodes, searchQuery])

  // 当前选中的实体详情
  const selectedNodeData = useMemo(() => {
    if (!selectedNode || !rawGraph) return null
    return rawGraph.getNode(selectedNode) || null
  }, [selectedNode, rawGraph])

  // 选中实体的关联邻居边与节点
  const neighborRelations = useMemo(() => {
    if (!selectedNode || !rawGraph) return []
    const rels: Array<{ edge: RawEdgeType; neighbor: RawNodeType; direction: 'outgoing' | 'incoming' }> = []

    for (const edge of allEdges) {
      if (edge.source === selectedNode) {
        const neighbor = rawGraph.getNode(edge.target)
        if (neighbor) rels.push({ edge, neighbor, direction: 'outgoing' })
      } else if (edge.target === selectedNode) {
        const neighbor = rawGraph.getNode(edge.source)
        if (neighbor) rels.push({ edge, neighbor, direction: 'incoming' })
      }
    }
    return rels
  }, [selectedNode, rawGraph, allEdges])

  // 实体关联的来源文档 ID
  const associatedDocIds = useMemo(() => {
    if (!selectedNodeData?.properties) return []
    const props = selectedNodeData.properties
    const ids: string[] = []
    if (props.source_id && typeof props.source_id === 'string') {
      ids.push(...props.source_id.split(',').map((s: string) => s.trim()))
    }
    if (props.doc_ids && Array.isArray(props.doc_ids)) {
      ids.push(...props.doc_ids)
    }
    return Array.from(new Set(ids.filter(Boolean)))
  }, [selectedNodeData])

  // 快速聚焦目标实体
  const handleFocusEntity = useCallback((entityId: string) => {
    setSelectedNode(entityId, true)
    setFocusedNode(entityId)
    setSearchQuery('')
  }, [setSelectedNode, setFocusedNode])

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background select-none">
      {/* 1. 顶部控制条 (Top Control Toolbar) */}
      <div className="flex items-center justify-between border-b border-border/60 bg-card/60 backdrop-blur-md px-4 py-2 shrink-0 gap-3 z-10">
        {/* 左侧：标题与实体搜索 */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <div className="size-8 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center border border-purple-500/20">
              <Network className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm tracking-tight text-foreground">Graph Studio 2.0</span>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 border border-purple-500/20">
                  N-Degree Subgraph
                </span>
              </div>
            </div>
          </div>

          <div className="h-4 w-px bg-border/60 mx-1 hidden sm:block" />

          {/* 实体搜索与自动补全 */}
          <div className="relative w-64 md:w-80">
            <div className="relative flex items-center">
              <Search className="size-3.5 text-muted-foreground absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索实体以聚焦局部拓扑..."
                className="w-full bg-muted/50 border border-border/70 rounded-xl pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500/50 transition-all"
              />
            </div>

            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-card border border-border/80 rounded-xl shadow-lg z-50 p-1.5 space-y-0.5 animate-in fade-in-50 zoom-in-95">
                <div className="px-2 py-1 text-[10px] text-muted-foreground font-semibold uppercase">
                  匹配实体 ({searchResults.length})
                </div>
                {searchResults.map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => handleFocusEntity(node.id)}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-muted/80 flex items-center justify-between transition-colors group cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <CircleDot className="size-3 text-purple-500 shrink-0" />
                      <span className="font-medium text-foreground truncate">{node.id}</span>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0">
                      {node.labels?.[0] || 'Entity'} · {node.degree} 连接
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 右侧：统计、局部探索度数与工具控件 */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* 图谱元数据徽章 */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-muted/40 rounded-xl border border-border/50 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{allNodes.length.toLocaleString()}</span>
            <span>实体</span>
            <span className="text-border">·</span>
            <span className="font-medium text-foreground">{allEdges.length.toLocaleString()}</span>
            <span>关联关系</span>
          </div>

          {/* 探索深度调节 */}
          <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-xl border border-border/50 text-xs">
            <span className="text-[11px] font-medium text-muted-foreground px-2">深度:</span>
            {([1, 2, 3] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setExploreDepth(d)}
                className={cn(
                  'px-2 py-0.5 text-xs rounded-lg font-medium transition-all cursor-pointer',
                  exploreDepth === d
                    ? 'bg-purple-600 text-white shadow-2xs font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {d}°
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchGraph(true)}
            disabled={isFetching}
            className="h-8 gap-1.5 text-xs rounded-xl border-border/70"
            tooltip="重新全量加载知识拓扑"
          >
            <RefreshCw className={cn('size-3.5', isFetching && 'animate-spin')} />
            <span className="hidden sm:inline">刷新图谱</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="h-8 px-2 text-xs rounded-xl"
            tooltip={sidebarOpen ? '收起实体导航栏' : '展开实体导航栏'}
          >
            <Layers className="size-4 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {/* 2. 核心双栏工作台 (Sidebar + Sigma Canvas + Drawer) */}
      <div className="flex flex-1 min-h-0 w-full overflow-hidden relative">
        {/* 左侧：实体分类与高频实体导航栏 */}
        {sidebarOpen && (
          <div className="w-64 border-r border-border/60 bg-card/40 flex flex-col shrink-0 h-full overflow-hidden animate-in slide-in-from-left duration-200">
            {/* 分类标签过滤 */}
            <div className="p-3 border-b border-border/50">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                实体分类 (Category)
              </div>
              <div className="flex flex-wrap gap-1">
                {categories.slice(0, 8).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={cn(
                      'px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors cursor-pointer',
                      activeCategory === cat
                        ? 'bg-purple-600 text-white font-bold'
                        : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {cat === 'all' ? '全部' : cat} ({cat === 'all' ? allNodes.length : categoryStats[cat] || 0})
                  </button>
                ))}
              </div>
            </div>

            {/* 核心高频实体推荐榜 */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                <span>核心关键实体</span>
                <span className="text-[9px] font-normal font-mono">TOP 15</span>
              </div>

              {popularEntities
                .filter((e) => activeCategory === 'all' || e.labels?.includes(activeCategory))
                .map((entity) => {
                  const isSelected = selectedNode === entity.id
                  return (
                    <button
                      key={entity.id}
                      type="button"
                      onClick={() => handleFocusEntity(entity.id)}
                      className={cn(
                        'w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-all cursor-pointer group',
                        isSelected
                          ? 'bg-purple-500/15 text-purple-600 font-semibold border border-purple-500/25'
                          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="size-2 rounded-full shrink-0"
                          style={{ backgroundColor: entity.color || '#a855f7' }}
                        />
                        <span className="truncate" title={entity.id}>
                          {entity.id}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground/80 shrink-0">
                        {entity.degree}
                      </span>
                    </button>
                  )
                })}
            </div>

            {/* 底部引导卡片 */}
            <div className="p-3 border-t border-border/50">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500/10 via-indigo-500/5 to-transparent border border-purple-500/20 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-purple-600 mb-1">
                  <Sparkles className="size-3.5" />
                  <span>知识网络下钻</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  点击任意实体可聚焦并自动提取局部关联。双击节点直接在右侧反向溯源文档。
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 中间：原版高性能 Sigma 图谱画板 (保证原版渲染机制 100% 正常运转) */}
        <div className="flex-1 h-full min-w-0 relative overflow-hidden">
          <Suspense fallback={<div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">正在加载图谱渲染引擎...</div>}>
            <GraphViewer />
          </Suspense>

          {/* 悬浮聚焦提示胶囊 */}
          {selectedNode && (
            <div className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card/90 backdrop-blur-md border border-purple-500/30 shadow-md text-xs animate-in fade-in-50">
              <span className="size-2 rounded-full bg-purple-500 animate-pulse" />
              <span className="text-muted-foreground">当前聚焦:</span>
              <span className="font-bold text-foreground">{selectedNode}</span>
              <button
                type="button"
                onClick={() => setSelectedNode(null)}
                className="text-muted-foreground hover:text-foreground ml-1 font-bold cursor-pointer"
                title="取消聚焦"
              >
                ×
              </button>
            </div>
          )}
        </div>

        {/* 右侧：实体与关联切片反向追踪抽屉 */}
        {selectedNodeData && (
          <div className="w-80 border-l border-border/60 bg-card/95 backdrop-blur-md flex flex-col shrink-0 h-full overflow-hidden shadow-lg z-20 animate-in slide-in-from-right duration-200">
            {/* 抽屉头部 */}
            <div className="p-4 border-b border-border/50 flex items-start justify-between gap-2">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className="size-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: selectedNodeData.color || '#a855f7' }}
                  />
                  <span className="text-[10px] font-mono uppercase font-semibold text-purple-600 bg-purple-500/10 px-1.5 py-0.2 rounded border border-purple-500/20">
                    {selectedNodeData.labels?.[0] || 'Entity'}
                  </span>
                </div>
                <h3 className="font-bold text-base text-foreground truncate" title={selectedNodeData.id}>
                  {selectedNodeData.id}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedNode(null)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                ×
              </button>
            </div>

            {/* 抽屉滚动内容区 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {/* 实体描述 */}
              {selectedNodeData.properties?.description && (
                <div className="space-y-1.5">
                  <div className="font-bold text-foreground flex items-center gap-1 text-[11px]">
                    <Info className="size-3.5 text-primary" />
                    <span>实体描述</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-muted/40 border border-border/50 text-muted-foreground leading-relaxed">
                    {selectedNodeData.properties.description}
                  </div>
                </div>
              )}

              {/* 拓扑关联关系 (Neighbors) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-foreground">
                  <span className="flex items-center gap-1">
                    <Activity className="size-3.5 text-purple-500" />
                    <span>关联关系 ({neighborRelations.length})</span>
                  </span>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {neighborRelations.map(({ edge, neighbor, direction }) => (
                    <button
                      key={edge.id}
                      type="button"
                      onClick={() => handleFocusEntity(neighbor.id)}
                      className="w-full text-left p-2 rounded-lg bg-muted/30 hover:bg-muted/70 border border-border/40 transition-colors flex items-center justify-between group cursor-pointer"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className="font-mono">{direction === 'outgoing' ? '➔ 出度' : '⬅ 入度'}</span>
                          <span className="font-semibold text-purple-600">[{edge.type || 'RELATED_TO'}]</span>
                        </div>
                        <div className="font-medium text-foreground truncate mt-0.5">{neighbor.id}</div>
                      </div>
                      <ChevronRight className="size-3.5 text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-0.5 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>

              {/* 关联原始文档反向追踪 (溯源能力) */}
              <div className="space-y-2 pt-2 border-t border-border/50">
                <div className="flex items-center justify-between text-[11px] font-bold text-foreground">
                  <span className="flex items-center gap-1">
                    <FileText className="size-3.5 text-blue-500" />
                    <span>溯源文档来源 ({associatedDocIds.length || '全库提取'})</span>
                  </span>
                </div>

                {associatedDocIds.length > 0 ? (
                  <div className="space-y-1.5">
                    {associatedDocIds.map((docId) => (
                      <div
                        key={docId}
                        className="p-2.5 rounded-xl bg-blue-500/5 border border-blue-500/20 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-[11px] text-foreground truncate font-medium">{docId}</div>
                          <div className="text-[10px] text-muted-foreground">提取实体权重关联切片</div>
                        </div>
                        <DocumentInspector docId={docId} fileName={docId} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-muted/20 border border-dashed border-border/60 text-center text-muted-foreground text-[11px]">
                    该实体由全库文本深度共现抽取提炼
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
