import React, { useMemo } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  FileTextIcon,
  LayersIcon,
  XIcon,
  ClockIcon,
  ZapIcon,
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon
} from 'lucide-react'
import type { MessageWithError } from '@/types/retrieval'
import { cn } from '@/lib/utils'
import { copyToClipboard } from '@/utils/clipboard'
import { toast } from 'sonner'

export interface EvidenceItem {
  fileName: string
  fileType: string
  snippet: string
  lineHint?: string
}

export interface ExtractedEvidence {
  documents: EvidenceItem[]
  entities: string[]
  hasEvidence: boolean
}

/**
 * Parses message content and extracts referenced documents, file paths, and key entities.
 */
export function extractEvidenceFromMessage(message: MessageWithError): ExtractedEvidence {
  const content = (message.displayContent || message.content || '') + '\n' + (message.thinkingContent || '')
  if (!content.trim()) {
    return { documents: [], entities: [], hasEvidence: false }
  }

  // 1. Match common file paths and document names
  // Matches e.g. Operations.md, src/core/service.py, doc.pdf, README.md#L10
  const docRegex = /(?:^|[\s`"'(])([a-zA-Z0-9_\-./\\]+\.(?:md|markdown|txt|pdf|docx|py|ts|tsx|json|yaml|yml|html|rst))(?:#L\d+(?:-L\d+)?)?(?:$|[\s`"')\]:,])/gi

  const docMap = new Map<string, EvidenceItem>()
  const lines = content.split('\n')

  lines.forEach((line) => {
    let match: RegExpExecArray | null
    // Reset regex for each line
    docRegex.lastIndex = 0
    while ((match = docRegex.exec(line)) !== null) {
      const rawMatch = match[1].trim()
      // Exclude trivial web domains or code symbols like .length or .test
      if (rawMatch.includes('http://') || rawMatch.includes('https://')) continue
      if (rawMatch.startsWith('.')) continue

      const parts = rawMatch.split('.')
      const ext = parts[parts.length - 1].toLowerCase()
      const baseName = rawMatch.split('/').pop() || rawMatch

      if (!docMap.has(rawMatch)) {
        // Extract surrounding context snippet
        const snippet = line.trim().replace(/^[-*#>\s]+/, '')
        docMap.set(rawMatch, {
          fileName: baseName,
          fileType: ext.toUpperCase(),
          snippet: snippet.length > 160 ? snippet.slice(0, 157) + '...' : snippet
        })
      }
    }
  })

  // 2. Extract prominent entity mentions: **Entity** or `Entity`
  const entitySet = new Set<string>()
  const boldRegex = /\*\*([A-Za-z0-9_\u4e00-\u9fa5\s-]{2,30})\*\*/g
  let boldMatch: RegExpExecArray | null
  while ((boldMatch = boldRegex.exec(content)) !== null) {
    const ent = boldMatch[1].trim()
    if (ent.length >= 2 && !ent.startsWith('http') && entitySet.size < 24) {
      entitySet.add(ent)
    }
  }

  const documents = Array.from(docMap.values())
  const entities = Array.from(entitySet)

  return {
    documents,
    entities,
    hasEvidence: documents.length > 0 || entities.length > 0
  }
}

interface EvidenceDrawerProps {
  isOpen: boolean
  onClose: () => void
  message: MessageWithError
}

export default function EvidenceDrawer({ isOpen, onClose, message }: EvidenceDrawerProps) {
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null)

  const evidence = useMemo(() => extractEvidenceFromMessage(message), [message])

  const handleCopyText = async (text: string, index: number) => {
    try {
      await copyToClipboard(text)
      setCopiedIndex(index)
      toast.success('已复制文件名到剪贴板')
      setTimeout(() => setCopiedIndex(null), 1800)
    } catch {
      toast.error('复制失败')
    }
  }

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        {/* Soft backdrop */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs transition-opacity duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        {/* Slide-over Drawer Content from Right */}
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border/80 bg-background/95 p-0 shadow-2xl backdrop-blur-md transition-all duration-300 ease-in-out sm:max-w-lg',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                <FileTextIcon className="size-4" />
              </div>
              <div>
                <DialogPrimitive.Title className="text-sm font-semibold tracking-tight text-foreground">
                  RAG 知识证据与溯源透视
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-xs text-muted-foreground">
                  从本次检索答复中提取的命中切片与关联实体
                </DialogPrimitive.Description>
              </div>
            </div>
            <DialogPrimitive.Close
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <XIcon className="size-4" />
              <span className="sr-only">关闭</span>
            </DialogPrimitive.Close>
          </div>

          {/* Performance Summary Banner */}
          <div className="flex items-center gap-4 border-b border-border/50 bg-muted/30 px-5 py-2.5 text-xs text-muted-foreground">
            {typeof message.responseTime === 'number' && (
              <span className="flex items-center gap-1 font-mono">
                <ClockIcon className="size-3 text-muted-foreground" />
                耗时: {message.responseTime.toFixed(2)}s
              </span>
            )}
            {typeof message.firstTokenTime === 'number' && (
              <span className="flex items-center gap-1 font-mono">
                <ZapIcon className="size-3 text-emerald-400" />
                首字: {message.firstTokenTime.toFixed(2)}s
              </span>
            )}
            <span className="flex items-center gap-1 font-mono">
              <LayersIcon className="size-3 text-primary" />
              命中引用: {evidence.documents.length} 处
            </span>
          </div>

          {/* Body Content List */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* 1. Referenced Documents Section */}
            <div>
              <div className="mb-2.5 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  关联文档切片 ({evidence.documents.length})
                </h3>
              </div>

              {evidence.documents.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/80 p-6 text-center text-xs text-muted-foreground">
                  本次回答为纯常识推理或未显式指涉特定文档切片
                </div>
              ) : (
                <div className="space-y-2.5">
                  {evidence.documents.map((doc, idx) => (
                    <div
                      key={idx}
                      className="group rounded-xl border border-border/70 bg-card/60 p-3 transition-all hover:border-emerald-500/40 hover:bg-card/90 hover:shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-mono font-medium text-emerald-400">
                            {doc.fileType}
                          </span>
                          <span className="text-xs font-medium text-foreground truncate select-all">
                            {doc.fileName}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyText(doc.fileName, idx)}
                          className="shrink-0 p-1 text-muted-foreground/60 transition-colors hover:text-foreground"
                          title="复制文件名"
                        >
                          {copiedIndex === idx ? (
                            <CheckIcon className="size-3.5 text-emerald-400" />
                          ) : (
                            <CopyIcon className="size-3.5" />
                          )}
                        </button>
                      </div>

                      {doc.snippet && (
                        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/90 bg-muted/40 p-2 rounded-md font-mono border border-border/40 line-clamp-3">
                          {doc.snippet}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 2. Extracted Entities Section */}
            {evidence.entities.length > 0 && (
              <div>
                <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  图谱核心实体与概念 ({evidence.entities.length})
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {evidence.entities.map((entity, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-emerald-500/30 hover:bg-emerald-500/5"
                    >
                      {entity}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border/70 bg-muted/20 p-4">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-border bg-card py-2 text-xs font-medium text-foreground transition-all hover:bg-muted active:scale-[0.99]"
            >
              关闭证据抽屉
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
