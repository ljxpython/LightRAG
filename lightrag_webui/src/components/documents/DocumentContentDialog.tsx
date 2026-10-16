import { useState, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import { FileText, Copy, Check, Loader2, Layers, AlignLeft, RefreshCw, Folder } from 'lucide-react'
import { copyToClipboard } from '@/utils/clipboard'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

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

interface DocumentContentDialogProps {
  docId: string
  fileName?: string
}

export default function DocumentContentDialog({ docId, fileName }: DocumentContentDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<DocumentContentData | null>(null)
  const [activeTab, setActiveTab] = useState<'chunks' | 'full'>('chunks')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const fetchContent = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/ops/documents/${encodeURIComponent(docId)}/content`)
      if (res.ok) {
        const resData: DocumentContentData = await res.json()
        setData(resData)
        if (resData.chunks_count > 0) {
          setActiveTab('chunks')
        } else if (resData.full_content && resData.full_content.trim().length > 0) {
          setActiveTab('full')
        }
      } else {
        toast.error('获取文档切片正文失败')
      }
    } catch (e) {
      console.error('Fetch doc content error:', e)
      toast.error('网络请求异常')
    } finally {
      setLoading(false)
    }
  }, [docId])

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) {
      fetchContent()
    }
  }

  const handleCopy = async (text: string, id: string) => {
    const res = await copyToClipboard(text)
    if (res.success) {
      setCopiedId(id)
      toast.success('已复制到剪贴板')
      setTimeout(() => setCopiedId(null), 2000)
    }
  }

  const displayName = fileName || docId

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 transition-all cursor-pointer select-none shadow-2xs"
          title="查看解析出的切片文本与全文"
        >
          <FileText className="size-3.5" />
          <span>查看内容</span>
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="flex-none border-b border-border/40 pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                <FileText className="size-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base font-semibold truncate text-foreground">
                  {displayName}
                </DialogTitle>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                  <span className="font-mono">ID: {docId}</span>
                  {data?.source_workspace && (
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] bg-muted/60 px-1.5 py-0.2 rounded">
                      <Folder className="size-2.5 text-muted-foreground" />
                      {data.source_workspace.split('/').slice(-2).join('/')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {data && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-xs">
                  {data.chunks_count} 个分块
                </span>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={fetchContent}
                disabled={loading}
                title="重新加载切片正文"
                className="size-7 text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
              </Button>
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex items-center gap-2 mt-3 pt-2">
            <button
              type="button"
              onClick={() => setActiveTab('chunks')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer',
                activeTab === 'chunks'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Layers className="size-3.5" />
              <span>切片分块 ({data?.chunks_count ?? 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('full')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer',
                activeTab === 'full'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <AlignLeft className="size-3.5" />
              <span>抽取全文 {data?.full_content ? `(${data.full_content.length} 字符)` : ''}</span>
            </button>
          </div>
        </DialogHeader>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto py-3 space-y-3 min-h-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="size-6 animate-spin text-emerald-500" />
              <span className="text-xs">正在从物理存储定位并加载解析切片与正文...</span>
            </div>
          ) : !data || (!data.chunks_count && !data.full_content) ? (
            <div className="flex flex-col items-center justify-center py-14 text-center space-y-2">
              <FileText className="size-8 text-muted-foreground/40" />
              <div className="text-sm font-medium text-foreground">暂无切片正文记录</div>
              <div className="text-xs text-muted-foreground max-w-sm">
                该文档可能处于后台解析队列处理中，或者底层存储尚未持久化全文切片。
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchContent}
                className="mt-2 text-xs"
              >
                <RefreshCw className="size-3 mr-1" />
                重新检查
              </Button>
            </div>
          ) : activeTab === 'chunks' ? (
            data.chunks.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                该文档未拆分独立分块，请切换至「抽取全文」标签查看完整解析文本。
              </div>
            ) : (
              data.chunks.map((chunk, index) => (
                <div
                  key={chunk.chunk_id}
                  className="rounded-lg border border-border/70 bg-card p-3 shadow-2xs space-y-2 text-xs transition-colors hover:border-emerald-500/40"
                >
                  <div className="flex items-center justify-between border-b border-border/40 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">分块 #{index + 1}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                        {chunk.tokens} tokens
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground/60 hidden sm:inline">
                        {chunk.chunk_id}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(chunk.content, chunk.chunk_id)}
                      className="h-6 px-2 text-[11px] gap-1 hover:text-emerald-500"
                    >
                      {copiedId === chunk.chunk_id ? (
                        <>
                          <Check className="size-3 text-emerald-500" />
                          <span className="text-emerald-500 font-medium">已复制</span>
                        </>
                      ) : (
                        <>
                          <Copy className="size-3" />
                          <span>复制</span>
                        </>
                      )}
                    </Button>
                  </div>
                  <pre className="font-sans text-xs whitespace-pre-wrap break-words leading-relaxed text-foreground/90 bg-muted/30 p-2.5 rounded selection:bg-emerald-500/20">
                    {chunk.content}
                  </pre>
                </div>
              ))
            )
          ) : (
            <div className="rounded-lg border border-border/70 bg-card p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-border/40 pb-2">
                <span className="text-xs font-semibold text-foreground">完整解析提取正文</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopy(data.full_content, 'full')}
                  className="h-6 px-2 text-[11px] gap-1 hover:text-emerald-500"
                >
                  {copiedId === 'full' ? (
                    <>
                      <Check className="size-3 text-emerald-500" />
                      <span className="text-emerald-500 font-medium">已复制全文</span>
                    </>
                  ) : (
                    <>
                      <Copy className="size-3" />
                      <span>复制全文</span>
                    </>
                  )}
                </Button>
              </div>
              <pre className="font-sans text-xs whitespace-pre-wrap break-words leading-relaxed text-foreground/90 bg-muted/30 p-3 rounded max-h-[55vh] overflow-y-auto selection:bg-emerald-500/20">
                {data.full_content || '(无全文记录)'}
              </pre>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
