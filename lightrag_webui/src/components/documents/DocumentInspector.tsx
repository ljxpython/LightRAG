import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  FileText,
  Copy,
  Check,
  Loader2,
  Layers,
  Search,
  X,
  ExternalLink,
  Code2,
  Hash,
  Sparkles,
  BookOpen,
  Filter
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import { copyToClipboard } from '@/utils/clipboard'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useFolderStore } from '@/stores/folderStore'

interface ChunkItem {
  chunk_id: string
  tokens: number
  content: string
  chunk_order_index?: number
}

interface DocumentContentData {
  status: string
  doc_id: string
  tenant_id?: string
  project_id?: string
  found?: boolean
  source_workspace?: string
  full_content: string
  chunks_count: number
  chunks: ChunkItem[]
}

interface DocumentInspectorProps {
  docId: string
  fileName?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: React.ReactNode
}

// 模拟或轻量提取切片中的关键词/实体作为 Badge 展示
function extractKeywords(content: string, maxKeywords = 4): string[] {
  // 匹配连续的大写英文缩写、驼峰词或中文专有名词
  const words = content.match(/[A-Z][a-zA-Z0-9_-]{2,}|[A-Z]{2,}|[\u4e00-\u9fa5]{2,6}/g) || []
  const unique = Array.from(new Set(words)).filter(
    (w) => !['the', 'and', 'with', 'from', 'that', 'this', '文档', '内容', '进行', '可以'].includes(w.toLowerCase())
  )
  return unique.slice(0, maxKeywords)
}

export default function DocumentInspector({
  docId,
  fileName,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  trigger
}: DocumentInspectorProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const isOpen = isControlled ? controlledOpen : internalOpen
  const setIsOpen = useCallback(
    (next: boolean) => {
      if (isControlled && setControlledOpen) {
        setControlledOpen(next)
      } else {
        setInternalOpen(next)
      }
    },
    [isControlled, setControlledOpen]
  )

  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<DocumentContentData | null>(null)
  const [activeTab, setActiveTab] = useState<'split' | 'content' | 'chunks'>('split')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedChunkIndex, setSelectedChunkIndex] = useState<number | null>(null)

  const { docFolderMap, folders } = useFolderStore()
  const folderId = docFolderMap[docId]
  const currentFolder = folders.find((f) => f.id === folderId)

  const fetchContent = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/ops/documents/${encodeURIComponent(docId)}/content`)
      if (res.ok) {
        const resData: DocumentContentData = await res.json()
        setData(resData)
      } else {
        toast.error('获取文档详情与切片失败')
      }
    } catch (e) {
      console.error('Fetch doc content error:', e)
      toast.error('网络请求异常')
    } finally {
      setLoading(false)
    }
  }, [docId])

  useEffect(() => {
    if (isOpen) {
      fetchContent()
    } else {
      setSelectedChunkIndex(null)
      setSearchQuery('')
    }
  }, [isOpen, fetchContent])

  const handleCopy = async (text: string, id: string) => {
    const res = await copyToClipboard(text)
    if (res.success) {
      setCopiedId(id)
      toast.success('已复制到剪贴板')
      setTimeout(() => setCopiedId(null), 2000)
    }
  }

  const chunks = useMemo(() => {
    if (!data?.chunks) return []
    if (!searchQuery.trim()) return data.chunks
    const query = searchQuery.toLowerCase()
    return data.chunks.filter((c) => c.content.toLowerCase().includes(query))
  }, [data?.chunks, searchQuery])

  const totalTokens = useMemo(() => {
    return (data?.chunks || []).reduce((acc, c) => acc + (c.tokens || 0), 0)
  }, [data?.chunks])

  const displayName = fileName || docId

  const contentLines = useMemo(() => {
    if (!data?.full_content) return []
    return data.full_content.split('\n')
  }, [data?.full_content])

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-primary/25 bg-primary/5 hover:bg-primary/15 text-primary transition-all cursor-pointer shadow-2xs"
            title="查看文档沉浸式双栏切片对照"
          >
            <BookOpen className="size-3.5" />
            <span>检视文档</span>
          </button>
        </DialogTrigger>
      )}

      <DialogContent
        className="flex flex-col p-0 gap-0 overflow-hidden bg-background border border-border/80 shadow-2xl transition-all duration-200 w-[94vw] max-w-7xl h-[88vh] max-h-[88vh] rounded-xl"
      >
        {/* 顶部工具栏 Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/60 bg-card/80 backdrop-blur shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0 shadow-2xs">
              <FileText className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-base font-semibold text-foreground truncate max-w-md">
                  {displayName}
                </DialogTitle>
                {currentFolder && (
                  <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0">
                    {currentFolder.name}
                  </span>
                )}
                {data?.status && (
                  <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                    {data.status}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono mt-0.5">
                <span>ID: {docId}</span>
                <span>•</span>
                <span>切片数: {data?.chunks_count ?? 0}</span>
                <span>•</span>
                <span>总 Tokens: {totalTokens}</span>
                <span>•</span>
                <span>字符数: {data?.full_content?.length ?? 0}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 pr-8">
            {/* 视口切换 */}
            <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border/50 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('split')}
                className={cn(
                  'px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer',
                  activeTab === 'split' ? 'bg-background text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                双栏对照
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('content')}
                className={cn(
                  'px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer',
                  activeTab === 'content' ? 'bg-background text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                仅原文
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('chunks')}
                className={cn(
                  'px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer',
                  activeTab === 'chunks' ? 'bg-background text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                仅切片 ({data?.chunks_count ?? 0})
              </button>
            </div>

            {data?.full_content && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(data.full_content, 'full_doc')}
                className="gap-1.5 text-xs h-8 cursor-pointer"
              >
                {copiedId === 'full_doc' ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                <span>复制全文</span>
              </Button>
            )}
          </div>
        </div>

        {/* 主内容区域 */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">正在穿透加载原始文档与解析切片...</p>
            </div>
          ) : !data ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <FileText className="size-12 opacity-30 mb-2" />
              <p className="text-sm">未能加载文档数据</p>
            </div>
          ) : (
            <div className="flex-1 flex w-full h-full min-h-0 divide-x divide-border/60">
              {/* 左侧：文档原文检视 */}
              {(activeTab === 'split' || activeTab === 'content') && (
                <div className="flex-1 flex flex-col min-w-0 bg-background/50">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-border/40 bg-muted/20 text-xs">
                    <div className="flex items-center gap-2 font-medium text-muted-foreground">
                      <Code2 className="size-3.5 text-primary" />
                      <span>原始提取正文 (Source Content)</span>
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      共 {contentLines.length} 行
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed select-text">
                    {contentLines.length === 0 ? (
                      <div className="text-muted-foreground italic">文档正文为空</div>
                    ) : (
                      <div className="table w-full">
                        {contentLines.map((line, idx) => (
                          <div
                            key={idx}
                            className="table-row hover:bg-accent/40 group transition-colors"
                          >
                            <span className="table-cell pr-4 text-right text-muted-foreground/40 select-none w-10 text-[11px]">
                              {idx + 1}
                            </span>
                            <span className="table-cell whitespace-pre-wrap break-words text-foreground/90 group-hover:text-foreground">
                              {line || ' '}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 右侧：切片瀑布流 (Chunks Flow) */}
              {(activeTab === 'split' || activeTab === 'chunks') && (
                <div className="w-[480px] shrink-0 flex flex-col bg-card/40 min-w-0">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-border/40 bg-muted/20 text-xs gap-2">
                    <div className="flex items-center gap-1.5 font-medium text-muted-foreground shrink-0">
                      <Layers className="size-3.5 text-primary" />
                      <span>切片对照 (Chunks)</span>
                    </div>

                    <div className="relative flex-1 max-w-[200px]">
                      <Search className="size-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="过滤切片内容..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-7 pr-2 py-1 text-[11px] rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    {chunks.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-xs">
                        <Layers className="size-8 opacity-30 mb-2" />
                        <span>无符合条件的切片数据</span>
                      </div>
                    ) : (
                      chunks.map((chunk, idx) => {
                        const order = chunk.chunk_order_index ?? idx
                        const isSelected = selectedChunkIndex === idx
                        const keywords = extractKeywords(chunk.content)

                        return (
                          <div
                            key={chunk.chunk_id || idx}
                            onClick={() => setSelectedChunkIndex(idx)}
                            className={cn(
                              'group rounded-lg border p-3 text-xs transition-all relative cursor-pointer',
                              isSelected
                                ? 'bg-primary/5 border-primary/50 ring-1 ring-primary/30 shadow-xs'
                                : 'bg-card border-border/70 hover:border-border hover:shadow-2xs'
                            )}
                          >
                            <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-border/40">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-primary/10 text-primary">
                                  Chunk #{order + 1}
                                </span>
                                <span className="text-[10px] font-mono text-muted-foreground/75 truncate" title={chunk.chunk_id}>
                                  {chunk.chunk_id}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                  {chunk.tokens} tokens
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleCopy(chunk.content, chunk.chunk_id)
                                  }}
                                  className="size-6 text-muted-foreground hover:text-foreground"
                                  tooltip="复制切片"
                                >
                                  {copiedId === chunk.chunk_id ? (
                                    <Check className="size-3 text-emerald-500" />
                                  ) : (
                                    <Copy className="size-3" />
                                  )}
                                </Button>
                              </div>
                            </div>

                            {/* 切片正文 */}
                            <p className="text-foreground/90 font-mono text-[11px] leading-relaxed line-clamp-6 group-hover:line-clamp-none select-text">
                              {chunk.content}
                            </p>

                            {/* 实体/特征标签 */}
                            {keywords.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1 mt-2.5 pt-2 border-t border-border/30">
                                <Sparkles className="size-3 text-amber-500 shrink-0" />
                                {keywords.map((kw, kIdx) => (
                                  <span
                                    key={kIdx}
                                    className="px-1.5 py-0.5 text-[9px] rounded font-medium bg-muted/80 text-muted-foreground hover:text-foreground border border-border/40"
                                  >
                                    {kw}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
