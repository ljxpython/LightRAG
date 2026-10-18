import { useCallback, useEffect, useRef, useState } from 'react'
import Textarea from '@/components/ui/Textarea'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import {
  CircleAlertIcon,
  EraserIcon,
  SendIcon,
  SquareIcon,
  XIcon,
  SparklesIcon,
  CompassIcon,
  NetworkIcon,
  TargetIcon,
  FileTextIcon,
  ZapIcon,
  ChevronDownIcon
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

export interface QueryComposerProps {
  isLoading: boolean
  stopDisabled: boolean
  onSend: (input: string) => string | null
  onStop: () => void
  onClear: () => void
  prefilledPrompt?: string
}

interface ModeItem {
  mode: string
  label: string
  desc: string
  icon: React.ComponentType<{ className?: string }>
  color: string
}

const MODES: ModeItem[] = [
  { mode: 'mix', label: 'Mix 融合', desc: '综合知识图谱与文档切片', icon: SparklesIcon, color: 'text-indigo-400' },
  { mode: 'hybrid', label: 'Hybrid 混合', desc: '向量与全文多路召回', icon: NetworkIcon, color: 'text-blue-400' },
  { mode: 'global', label: 'Global 全局', desc: '全库宏观拓扑与核心主题', icon: CompassIcon, color: 'text-emerald-400' },
  { mode: 'local', label: 'Local 局部', desc: '深度依赖实体高精下钻', icon: TargetIcon, color: 'text-purple-400' },
  { mode: 'naive', label: 'Naive 切片', desc: '基础文本片段检索', icon: FileTextIcon, color: 'text-amber-400' },
  { mode: 'bypass', label: 'Bypass 直通', desc: '跳过检索直接对话模型', icon: ZapIcon, color: 'text-rose-400' }
]

export default function QueryComposer({
  isLoading,
  stopDisabled,
  onSend,
  onStop,
  onClear,
  prefilledPrompt
}: QueryComposerProps) {
  const { t } = useTranslation()
  const [inputValue, setInputValue] = useState('')
  const [inputError, setInputError] = useState('')
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const modeMenuRef = useRef<HTMLDivElement>(null)

  // Extract current mode prefix if user types /<mode>
  const currentModeMatch = inputValue.match(/^\/([a-zA-Z0-9_-]+)/)
  const activePillMode = currentModeMatch ? currentModeMatch[1].toLowerCase() : null
  const currentModeObj = MODES.find((m) => m.mode === activePillMode) || MODES[0]

  const handleSelectMode = useCallback((mode: string) => {
    const prefixRegex = /^\/([a-zA-Z0-9_-]+)\s*/
    let nextValue = ''
    if (prefixRegex.test(inputValue)) {
      nextValue = inputValue.replace(prefixRegex, `/${mode} `)
    } else {
      nextValue = `/${mode} ${inputValue.trimStart()}`
    }
    setInputValue(nextValue)
    setIsModeMenuOpen(false)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      if (inputRef.current?.setSelectionRange) {
        inputRef.current.setSelectionRange(nextValue.length, nextValue.length)
      }
    })
  }, [inputValue])

  useEffect(() => {
    if (prefilledPrompt) {
      setInputValue(prefilledPrompt)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [prefilledPrompt])

  // Close mode menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modeMenuRef.current && !modeMenuRef.current.contains(e.target as Node)) {
        setIsModeMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const dismissInputError = useCallback(() => {
    setInputError('')
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const hasMultipleLines = inputValue.includes('\n')

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setInputValue(e.target.value)
    },
    []
  )

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!inputValue.trim() || isLoading) return

      const error = onSend(inputValue)
      if (error) {
        setInputError(error)
        return
      }
      setInputError('')
      setInputValue('')

      if (inputRef.current && 'style' in inputRef.current) {
        inputRef.current.style.height = '44px'
      }
    },
    [inputValue, isLoading, onSend]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault()
        const target = e.target as HTMLInputElement | HTMLTextAreaElement
        const start = target.selectionStart || 0
        const end = target.selectionEnd || 0
        const newValue = inputValue.slice(0, start) + '\n' + inputValue.slice(end)
        setInputValue(newValue)

        requestAnimationFrame(() => {
          target.selectionStart = target.selectionEnd = start + 1
          if ('scrollHeight' in target) {
            target.style.height = 'auto'
            target.style.height = Math.min(target.scrollHeight, 160) + 'px'
          }
        })
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit(e)
      }
    },
    [handleSubmit, inputValue]
  )

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text')
    if (text.includes('\n')) {
      requestAnimationFrame(() => {
        if (inputRef.current && 'scrollHeight' in inputRef.current) {
          inputRef.current.style.height = 'auto'
          inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 160) + 'px'
        }
      })
    }
  }, [])

  return (
    <div className="relative mx-auto w-full max-w-4xl px-1 sm:px-2 select-none">
      <form
        onSubmit={handleSubmit}
        className="relative flex flex-col rounded-2xl border border-border/80 bg-card/85 p-2 sm:p-2.5 shadow-lg shadow-black/5 backdrop-blur-xl transition-all duration-200 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10"
        autoComplete="on"
        method="post"
        action="#"
        role="search"
      >
        <input type="submit" style={{ display: 'none' }} tabIndex={-1} />

        {/* Error Alert Overlay */}
        {inputError && (
          <div
            id="query-input-error"
            role="alert"
            className="border-destructive/35 bg-background/95 text-destructive absolute inset-x-0 bottom-full z-30 mb-2 flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm shadow-xl backdrop-blur-md"
          >
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 break-words font-medium">{inputError}</span>
            <button
              type="button"
              onClick={dismissInputError}
              className="hover:bg-destructive/10 focus-visible:ring-ring relative -my-1 -me-1 flex size-7 shrink-0 items-center justify-center rounded-md cursor-pointer"
              aria-label={t('retrievePanel.retrieval.dismissError')}
            >
              <XIcon className="size-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Text Input Row */}
        <div className="relative w-full px-1">
          <label htmlFor="query-input" className="sr-only">
            {t('retrievePanel.retrieval.placeholder')}
          </label>
          {hasMultipleLines ? (
            <Textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              id="query-input"
              autoComplete="on"
              className="max-h-[160px] min-h-[44px] w-full overflow-y-auto border-0 bg-transparent px-2 py-1 text-sm sm:text-base leading-relaxed text-foreground placeholder:text-muted-foreground/60 shadow-none focus-visible:ring-0 focus-visible:outline-none"
              value={inputValue}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={t('retrievePanel.retrieval.placeholder')}
              disabled={isLoading}
              aria-invalid={inputError ? true : undefined}
              aria-describedby={inputError ? 'query-input-error' : undefined}
              rows={2}
              style={{
                resize: 'none',
                height: 'auto',
                minHeight: '44px',
                maxHeight: '160px'
              }}
              onInput={(e: React.FormEvent<HTMLTextAreaElement>) => {
                const target = e.target as HTMLTextAreaElement
                requestAnimationFrame(() => {
                  target.style.height = 'auto'
                  target.style.height = Math.min(target.scrollHeight, 160) + 'px'
                })
              }}
            />
          ) : (
            <Input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              id="query-input"
              autoComplete="on"
              className="min-h-11 w-full border-0 bg-transparent px-2 py-1 text-sm sm:text-base text-foreground placeholder:text-muted-foreground/60 shadow-none focus-visible:ring-0 focus-visible:outline-none"
              value={inputValue}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={t('retrievePanel.retrieval.placeholder')}
              disabled={isLoading}
              aria-invalid={inputError ? true : undefined}
              aria-describedby={inputError ? 'query-input-error' : undefined}
            />
          )}
        </div>

        {/* Integrated Bottom Toolbar */}
        <div className="flex items-center justify-between border-t border-border/40 pt-2 mt-1 px-1">
          {/* Left: Mode Picker & Clear */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Embedded Mode Pill Dropdown */}
            <div className="relative" ref={modeMenuRef}>
              <button
                type="button"
                onClick={() => setIsModeMenuOpen(!isModeMenuOpen)}
                className="group flex items-center gap-1.5 rounded-lg border border-border/70 bg-muted/40 hover:bg-muted px-2.5 py-1 text-xs font-medium text-foreground transition-all duration-150 cursor-pointer shadow-2xs hover:border-primary/40"
                title="切换当前检索模式"
              >
                <currentModeObj.icon className={cn('size-3.5', currentModeObj.color)} />
                <span className="font-semibold">{currentModeObj.label}</span>
                <ChevronDownIcon className="size-3 text-muted-foreground group-hover:text-foreground transition-transform" />
              </button>

              {isModeMenuOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-64 rounded-xl border border-border/80 bg-popover/95 p-1.5 shadow-xl backdrop-blur-md z-40 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-2 py-1 text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase border-b border-border/40 mb-1">
                    选择知识检索模式
                  </div>
                  <div className="space-y-0.5">
                    {MODES.map((item) => {
                      const Icon = item.icon
                      const isSelected = activePillMode === item.mode || (!activePillMode && item.mode === 'mix')
                      return (
                        <button
                          key={item.mode}
                          type="button"
                          onClick={() => handleSelectMode(item.mode)}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer',
                            isSelected
                              ? 'bg-primary/10 text-primary font-semibold'
                              : 'text-foreground hover:bg-muted'
                          )}
                        >
                          <Icon className={cn('size-4 shrink-0', item.color)} />
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="truncate">{item.label}</span>
                            <span className="text-[10px] text-muted-foreground truncate">{item.desc}</span>
                          </div>
                          {isSelected && <span className="size-1.5 rounded-full bg-primary" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Clear Button */}
            <Button
              type="button"
              variant="ghost"
              onClick={onClear}
              disabled={isLoading}
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md gap-1"
              title="清空当前问答历史"
            >
              <EraserIcon className="size-3.5" />
              <span className="hidden sm:inline">{t('retrievePanel.retrieval.clear')}</span>
            </Button>
          </div>

          {/* Right: Keyboard Hint & Send/Stop Button */}
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-[11px] font-mono text-muted-foreground/60">
              Enter 发送 · Shift+Enter 换行
            </span>

            {isLoading ? (
              <Button
                type="button"
                variant="destructive"
                onClick={onStop}
                disabled={stopDisabled}
                size="sm"
                className="size-8 rounded-lg cursor-pointer shadow-xs"
                aria-label={t('retrievePanel.retrieval.stop')}
              >
                <SquareIcon className="size-3.5" />
                <span className="sr-only">{t('retrievePanel.retrieval.stop')}</span>
              </Button>
            ) : (
              <Button
                type="submit"
                variant="default"
                size="sm"
                className="size-8 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-95 cursor-pointer shadow-xs shadow-primary/20"
                aria-label={t('retrievePanel.retrieval.send')}
              >
                <SendIcon className="size-3.5" />
                <span className="sr-only">{t('retrievePanel.retrieval.send')}</span>
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}
