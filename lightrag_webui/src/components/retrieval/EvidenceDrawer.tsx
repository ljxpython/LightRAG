import React, { useMemo, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  FileTextIcon,
  LayersIcon,
  XIcon,
  ClockIcon,
  ZapIcon,
  CopyIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DatabaseIcon,
  QuoteIcon
} from 'lucide-react'
import type { MessageWithError } from '@/types/retrieval'
import type { ReferenceItem } from '@/api/lightrag'
import { cn } from '@/lib/utils'
import { copyToClipboard } from '@/utils/clipboard'
import { toast } from 'sonner'

export interface GroundedEvidenceDoc {
  referenceId: string
  filePath: string
  fileName: string
  fileType: string
  chunks: string[]
}

export interface GroundedEvidenceSummary {
  documents: GroundedEvidenceDoc[]
  totalChunks: number
  hasEvidence: boolean
}

/**
 * Extracts and structures genuine RAG reference items returned by the server.
 * Completely immune to LLM hallucination and thinking-process noise.
 */
export function getGroundedEvidence(message: MessageWithError): GroundedEvidenceSummary {
  const references = message.references || []
  if (!references.length) {
    return { documents: [], totalChunks: 0, hasEvidence: false }
  }

  const documents: GroundedEvidenceDoc[] = references.map((ref: ReferenceItem, idx: number) => {
    const rawPath = ref.file_path || `document_${idx + 1}`
    const fileName = rawPath.split('/').pop() || rawPath
    const parts = fileName.split('.')
    const ext = parts.length > 1 ? parts[parts.length - 1].toUpperCase() : 'DOC'
    const chunks = (ref.content && ref.content.length > 0)
      ? ref.content
      : []

    return {
      referenceId: ref.reference_id || `ref-${idx + 1}`,
      filePath: rawPath,
      fileName,
      fileType: ext,
      chunks
    }
  })

  const totalChunks = documents.reduce((sum, doc) => sum + Math.max(1, doc.chunks.length), 0)

  return {
    documents,
    totalChunks,
    hasEvidence: documents.length > 0
  }
}

interface EvidenceDrawerProps {
  isOpen: boolean
  onClose: () => void
  message: MessageWithError
}

export default function EvidenceDrawer({ isOpen, onClose, message }: EvidenceDrawerProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [expandedChunks, setExpandedChunks] = useState<Record<string, boolean>>({})

  const evidence = useMemo(() => getGroundedEvidence(message), [message])

  const handleCopyText = async (text: string, key: string, successMsg = '已复制到剪贴板') => {
    try {
      await copyToClipboard(text)
      setCopiedKey(key)
      toast.success(successMsg)
      setTimeout(() => setCopiedKey(null), 1800)
    } catch {
      toast.error('复制失败')
    }
  }

  const toggleChunkExpand = (key: string) => {
    setExpandedChunks((prev) => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        {/* Backdrop */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs transition-opacity duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        {/* Slide-over Drawer Content from Right */}
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border/80 bg-background/95 p-0 shadow-2xl backdrop-blur-md transition-all duration-300 ease-in-out sm:max-w-xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/70 px-5 py-4 bg-muted/20">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                <DatabaseIcon className="size-4.5" />
              </div>
              <div>
                <DialogPrimitive.Title className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
                  <span>RAG 知识证据与溯源透视</span>
                  <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-mono text-emerald-400">
                    服务端实证
                  </span>
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-xs text-muted-foreground mt-0.5">
                  底层检索召回的结构化真实文档切片（无模型臆测干扰）
                </DialogPrimitive.Description>
              </div>
            </div>
            <DialogPrimitive.Close
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
            >
              <XIcon className="size-4" />
              <span className="sr-only">关闭</span>
            </DialogPrimitive.Close>
          </div>

          {/* Performance Summary Banner */}
          <div className="flex flex-wrap items-center gap-4 border-b border-border/50 bg-muted/40 px-5 py-2.5 text-xs text-muted-foreground font-mono">
            {typeof message.responseTime === 'number' && (
              <span className="flex items-center gap-1">
                <ClockIcon className="size-3 text-muted-foreground" />
                耗时: {message.responseTime.toFixed(2)}s
              </span>
            )}
            {typeof message.firstTokenTime === 'number' && (
              <span className="flex items-center gap-1">
                <ZapIcon className="size-3 text-emerald-400" />
                首字: {message.firstTokenTime.toFixed(2)}s
              </span>
            )}
            <span className="flex items-center gap-1 text-emerald-400 font-semibold">
              <LayersIcon className="size-3" />
              命中引用: {evidence.documents.length} 文档 / {evidence.totalChunks} 切片
            </span>
          </div>

          {/* Body Content List */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FileTextIcon className="size-3.5" />
                  <span>命中召回文档与正文切片 ({evidence.documents.length})</span>
                </h3>
              </div>

              {!evidence.hasEvidence ? (
                <div className="rounded-xl border border-dashed border-border/80 p-8 text-center text-xs text-muted-foreground space-y-2.5 bg-muted/10">
                  <QuoteIcon className="size-8 mx-auto text-muted-foreground/30" />
                  <p className="font-semibold text-foreground/90 text-sm">暂未持久化关联文档切片</p>
                  <p className="text-xs text-muted-foreground leading-relaxed max-w-sm mx-auto">
                    此回答来自历史会话归档（未持久化切片全文），或本次提问未命中知识库切片（Bypass 模式）。
                  </p>
                  <div className="pt-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-[11px] font-medium text-emerald-400">
                      💡 发送新消息即可实时透视真实召回切片
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {evidence.documents.map((doc, docIdx) => (
                    <div
                      key={doc.referenceId || docIdx}
                      className="rounded-xl border border-border/80 bg-card/70 overflow-hidden transition-all hover:border-emerald-500/40 hover:bg-card/90 hover:shadow-xs"
                    >
                      {/* Document Card Header */}
                      <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-muted/30 px-3.5 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-mono font-medium text-emerald-400">
                            {doc.fileType}
                          </span>
                          <span className="text-xs font-semibold text-foreground truncate select-all" title={doc.filePath}>
                            {doc.fileName}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyText(doc.fileName, `doc-${docIdx}`, '已复制文件名')}
                          className="shrink-0 p-1 text-muted-foreground/60 transition-colors hover:text-foreground cursor-pointer"
                          title="复制文件名"
                        >
                          {copiedKey === `doc-${docIdx}` ? (
                            <CheckIcon className="size-3.5 text-emerald-400" />
                          ) : (
                            <CopyIcon className="size-3.5" />
                          )}
                        </button>
                      </div>

                      {/* Chunks List under this Document */}
                      <div className="p-3 space-y-3">
                        {doc.chunks.length === 0 ? (
                          <div className="text-[11px] text-muted-foreground/70 italic px-1">
                            引用了该文档元数据，未回传完整文本切片。
                          </div>
                        ) : (
                          doc.chunks.map((chunkText, chunkIdx) => {
                            const chunkKey = `${doc.referenceId}-c-${chunkIdx}`
                            const isExpanded = Boolean(expandedChunks[chunkKey])
                            const isLong = chunkText.length > 280

                            return (
                              <div
                                key={chunkIdx}
                                className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-xs font-mono transition-colors"
                              >
                                <div className="flex items-center justify-between text-[11px] text-muted-foreground pb-1.5 mb-1.5 border-b border-border/30">
                                  <span className="text-emerald-500/90 font-medium">切片 #{chunkIdx + 1} ({chunkText.length} 字符)</span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyText(chunkText, chunkKey, '已复制切片正文')}
                                    className="inline-flex items-center gap-1 hover:text-foreground text-[10px] cursor-pointer"
                                    title="复制此切片原文"
                                  >
                                    {copiedKey === chunkKey ? (
                                      <CheckIcon className="size-3 text-emerald-400" />
                                    ) : (
                                      <CopyIcon className="size-3" />
                                    )}
                                    <span>{copiedKey === chunkKey ? '已复制' : '复制切片'}</span>
                                  </button>
                                </div>

                                <div className={cn(
                                  'text-[11px] leading-relaxed text-foreground/90 whitespace-pre-wrap break-words',
                                  !isExpanded && isLong && 'line-clamp-4'
                                )}>
                                  {chunkText}
                                </div>

                                {isLong && (
                                  <button
                                    type="button"
                                    onClick={() => toggleChunkExpand(chunkKey)}
                                    className="mt-2 inline-flex items-center gap-1 text-[10px] font-sans text-emerald-400 hover:text-emerald-300 cursor-pointer"
                                  >
                                    {isExpanded ? (
                                      <>
                                        <ChevronUpIcon className="size-3" />
                                        <span>收起内容</span>
                                      </>
                                    ) : (
                                      <>
                                        <ChevronDownIcon className="size-3" />
                                        <span>展开全文 ({chunkText.length} 字符)</span>
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border/70 bg-muted/20 p-4">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-border bg-card py-2 text-xs font-medium text-foreground transition-all hover:bg-muted active:scale-[0.99] cursor-pointer"
            >
              关闭证据抽屉
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
