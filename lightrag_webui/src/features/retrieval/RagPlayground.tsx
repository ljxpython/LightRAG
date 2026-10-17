import { useState, useCallback } from 'react'
import {
  SplitSquareVertical,
  Play,
  Layers,
  Sparkles,
  Clock,
  CheckCircle2,
  Copy,
  Check,
  RotateCcw,
  Sliders,
  Send,
  Loader2
} from 'lucide-react'
import Button from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { queryText, QueryRequest } from '@/api/lightrag'
import { copyToClipboard } from '@/utils/clipboard'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface PlaygroundResult {
  mode: string
  response: string
  latencyMs: number
  loading: boolean
  error?: string
}

export default function RagPlayground() {
  const [prompt, setPrompt] = useState('')
  const [modeA, setModeA] = useState<string>('hybrid')
  const [modeB, setModeB] = useState<string>('naive')
  const [copiedCol, setCopiedCol] = useState<'A' | 'B' | null>(null)

  const [resultA, setResultA] = useState<PlaygroundResult>({
    mode: 'hybrid',
    response: '',
    latencyMs: 0,
    loading: false
  })

  const [resultB, setResultB] = useState<PlaygroundResult>({
    mode: 'naive',
    response: '',
    latencyMs: 0,
    loading: false
  })

  const runSingleQuery = async (
    query: string,
    mode: string,
    setter: React.Dispatch<React.SetStateAction<PlaygroundResult>>
  ) => {
    setter({
      mode,
      response: '',
      latencyMs: 0,
      loading: true
    })
    const start = performance.now()
    try {
      const payload: QueryRequest = {
        query,
        mode: mode as any,
        stream: false
      }
      const res = await queryText(payload)
      const duration = Math.round(performance.now() - start)
      setter({
        mode,
        response: res.response || '无返回内容',
        latencyMs: duration,
        loading: false
      })
    } catch (e: any) {
      const duration = Math.round(performance.now() - start)
      setter({
        mode,
        response: '',
        latencyMs: duration,
        loading: false,
        error: e.message || '查询请求失败'
      })
    }
  }

  const handleRunComparison = useCallback(() => {
    if (!prompt.trim()) {
      toast.error('请输入评测 Query')
      return
    }
    runSingleQuery(prompt, modeA, setResultA)
    runSingleQuery(prompt, modeB, setResultB)
  }, [prompt, modeA, modeB])

  const handleCopy = async (text: string, col: 'A' | 'B') => {
    const res = await copyToClipboard(text)
    if (res.success) {
      setCopiedCol(col)
      toast.success('已复制到剪贴板')
      setTimeout(() => setCopiedCol(null), 2000)
    }
  }

  const MODES = [
    { value: 'hybrid', label: 'Hybrid 混合图谱+切片' },
    { value: 'mix', label: 'Mix 知识多层融合' },
    { value: 'global', label: 'Global 全局宏观关系' },
    { value: 'local', label: 'Local 局部高精实体' },
    { value: 'naive', label: 'Naive 纯向量相似度' },
    { value: 'bypass', label: 'Bypass 直连大模型' }
  ]

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-background">
      {/* 顶部实验台工具条 */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/60 bg-muted/20 shrink-0">
        <div className="flex items-center gap-2">
          <SplitSquareVertical className="size-4 text-primary" />
          <span className="font-semibold text-xs tracking-wider uppercase text-foreground">
            RAG 对比实验台 (Playground)
          </span>
          <span className="text-[11px] text-muted-foreground ml-2">
            同屏并发双路检索评测，快速对比图谱与向量召回差异
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setResultA({ mode: modeA, response: '', latencyMs: 0, loading: false })
              setResultB({ mode: modeB, response: '', latencyMs: 0, loading: false })
              setPrompt('')
            }}
            className="h-7 text-xs"
          >
            <RotateCcw className="size-3 mr-1" />
            <span>重置</span>
          </Button>
        </div>
      </div>

      {/* 双栏对比视口 */}
      <div className="flex-1 min-h-0 flex divide-x divide-border/60 overflow-hidden">
        {/* Column A */}
        <div className="flex-1 flex flex-col min-w-0 bg-card/30">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-muted/30">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                栏位 A
              </span>
              <select
                value={modeA}
                onChange={(e) => setModeA(e.target.value)}
                className="px-2 py-1 text-xs rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              {resultA.latencyMs > 0 && (
                <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1">
                  <Clock className="size-3 text-muted-foreground" />
                  {resultA.latencyMs} ms
                </span>
              )}
              {resultA.response && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleCopy(resultA.response, 'A')}
                  className="size-6 text-muted-foreground hover:text-foreground"
                >
                  {copiedCol === 'A' ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                </Button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 text-sm leading-relaxed font-sans select-text">
            {resultA.loading ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2.5 text-muted-foreground">
                <Loader2 className="size-6 animate-spin text-primary" />
                <span className="text-xs">正在执行 {modeA} 模式检索...</span>
              </div>
            ) : resultA.error ? (
              <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-xs">
                {resultA.error}
              </div>
            ) : resultA.response ? (
              <div className="whitespace-pre-wrap text-foreground/90 text-xs font-mono leading-relaxed">
                {resultA.response}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground/60 text-xs">
                <Layers className="size-8 opacity-30 mb-2" />
                <span>等待在下方输入 Prompt 发起评测</span>
              </div>
            )}
          </div>
        </div>

        {/* Column B */}
        <div className="flex-1 flex flex-col min-w-0 bg-card/30">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-muted/30">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                栏位 B
              </span>
              <select
                value={modeB}
                onChange={(e) => setModeB(e.target.value)}
                className="px-2 py-1 text-xs rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              {resultB.latencyMs > 0 && (
                <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1">
                  <Clock className="size-3 text-muted-foreground" />
                  {resultB.latencyMs} ms
                </span>
              )}
              {resultB.response && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleCopy(resultB.response, 'B')}
                  className="size-6 text-muted-foreground hover:text-foreground"
                >
                  {copiedCol === 'B' ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                </Button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 text-sm leading-relaxed font-sans select-text">
            {resultB.loading ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2.5 text-muted-foreground">
                <Loader2 className="size-6 animate-spin text-primary" />
                <span className="text-xs">正在执行 {modeB} 模式检索...</span>
              </div>
            ) : resultB.error ? (
              <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-xs">
                {resultB.error}
              </div>
            ) : resultB.response ? (
              <div className="whitespace-pre-wrap text-foreground/90 text-xs font-mono leading-relaxed">
                {resultB.response}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground/60 text-xs">
                <Layers className="size-8 opacity-30 mb-2" />
                <span>等待在下方输入 Prompt 发起评测</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 底部输入框 */}
      <div className="p-4 border-t border-border/60 bg-card/60 shrink-0">
        <div className="max-w-4xl mx-auto flex items-end gap-3">
          <div className="flex-1 relative">
            <textarea
              rows={2}
              placeholder="输入待评测的 Query 问题，回车并发对比 Mode A 与 Mode B..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleRunComparison()
                }
              }}
              className="w-full resize-none rounded-xl border border-border/80 bg-background px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-xs leading-relaxed"
            />
          </div>

          <Button
            size="sm"
            onClick={handleRunComparison}
            disabled={resultA.loading || resultB.loading || !prompt.trim()}
            className="h-10 px-5 gap-1.5 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
          >
            {resultA.loading || resultB.loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            <span>并发评测</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
