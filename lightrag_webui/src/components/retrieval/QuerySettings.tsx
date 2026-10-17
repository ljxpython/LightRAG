import { useCallback, useMemo, useRef, useState } from 'react'
import { QueryMode, QueryRequest } from '@/api/lightrag'
// Removed unused import for Text component
import Checkbox from '@/components/ui/Checkbox'
import Input from '@/components/ui/Input'
import UserPromptInputWithHistory from '@/components/ui/UserPromptInputWithHistory'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/Select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip'
import { useSettingsStore } from '@/stores/settings'
import { useQuerySettingsStore } from '@/stores/querySettings'
import { useTranslation } from 'react-i18next'
import { CircleHelp, RotateCcw, PanelRightClose, PanelRightOpen, Sparkles, Database, Sliders } from 'lucide-react'
import { cn } from '@/lib/utils'

const ResetButton = ({ onClick, title }: { onClick: () => void; title: string }) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className="mr-1 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title={title}
        >
          <RotateCcw className="h-3 w-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">
        <p>{title}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
)

export default function QuerySettings() {
  const { t } = useTranslation()
  const querySettings = useQuerySettingsStore((state) => state.querySettings)
  const userPromptHistory = useSettingsStore((state) => state.userPromptHistory)
  const [scopeHelpOpen, setScopeHelpOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('lightrag_retrieval_sidebar_collapsed') === 'true'
    } catch {
      return false
    }
  })

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('lightrag_retrieval_sidebar_collapsed', String(next))
      } catch {}
      return next
    })
  }, [])

  // What the tooltip's state was when the tap STARTED. Radix dismisses an open
  // tooltip from a document-level pointerdown listener, so by the time the
  // click lands the state no longer says whether the user meant to open or to
  // close — this does. React's capture handler runs before that listener.
  const scopeHelpOpenAtPointerDown = useRef(false)

  const handleChange = useCallback((key: keyof QueryRequest, value: any) => {
    useQuerySettingsStore.getState().updateQuerySettings({ [key]: value })
  }, [])

  const handleSelectFromHistory = useCallback((prompt: string) => {
    handleChange('user_prompt', prompt)
  }, [handleChange])

  const handleDeleteFromHistory = useCallback((index: number) => {
    const newHistory = [...userPromptHistory]
    newHistory.splice(index, 1)
    useSettingsStore.getState().setUserPromptHistory(newHistory)
  }, [userPromptHistory])

  // Default values for reset functionality
  const defaultValues = useMemo(() => ({
    mode: 'mix' as QueryMode,
    top_k: 40,
    chunk_top_k: 20,
    max_entity_tokens: 6000,
    max_relation_tokens: 8000,
    max_total_tokens: 30000
  }), [])

  const handleReset = useCallback((key: keyof typeof defaultValues) => {
    handleChange(key, defaultValues[key])
  }, [handleChange, defaultValues])

  // Mix offers the best retrieval coverage; Bypass intentionally skips retrieval.
  // Warn only for the narrower-coverage modes (hybrid/naive/local/global).
  const showQualityWarning =
    querySettings.mode !== 'mix' && querySettings.mode !== 'bypass'

  if (isCollapsed) {
    return (
      <div className="flex shrink-0 flex-col items-center py-3 w-12 rounded-xl border border-border/70 bg-card/75 backdrop-blur-md transition-all gap-4 select-none">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleCollapsed}
                className="flex size-8 items-center justify-center rounded-lg border border-border/80 bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground transition-all cursor-pointer shadow-xs active:scale-95"
                aria-label="展开检索参数配置"
              >
                <PanelRightOpen className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>展开检索参数配置</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="flex flex-col items-center gap-3">
          <span className="text-[10px] font-mono tracking-widest text-muted-foreground [writing-mode:vertical-lr] rotate-180">
            参数配置
          </span>
          <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1 py-0.5 text-[9px] font-mono text-emerald-400 uppercase font-semibold">
            {querySettings.mode}
          </span>
        </div>
      </div>
    )
  }

  return (
    <Card className="flex shrink-0 flex-col w-[295px] border border-border/70 bg-card/80 backdrop-blur-md transition-all shadow-xs">
      <CardHeader className="px-3.5 pt-3.5 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
            {t('retrievePanel.querySettings.parametersTitle')}
          </CardTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  className="rounded-lg p-1 text-muted-foreground/80 hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                  aria-label="收起参数侧边栏"
                >
                  <PanelRightClose className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>收起参数侧边栏</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <CardDescription className="sr-only">{t('retrievePanel.querySettings.parametersDescription')}</CardDescription>
        {/* The query entry (/workspace) reads these same settings from this browser's
            storage, so say whose queries they affect right where they are edited.
            One line here, the rest behind the help tooltip. */}
        <div className="text-muted-foreground flex items-center gap-1 text-[11px] leading-none pt-1">
          {/* One line, always: a longer translation is ellipsized rather than
              pushing the panel's controls down. The full text is in the tooltip. */}
          <span className="min-w-0 truncate">
            {t('retrievePanel.querySettings.parametersScopeNotice')}
          </span>
          <TooltipProvider>
            <Tooltip open={scopeHelpOpen} onOpenChange={setScopeHelpOpen}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t('retrievePanel.querySettings.parametersScopeHelpLabel')}
                  // Hover opens it on a pointer device; a tap has to work too —
                  // and a 12px icon is not a tap target, so the padding grows the
                  // hit box to 24x24 (WCAG 2.2 target size) while the negative
                  // margins keep it occupying exactly the icon's own space.
                  className="-my-1.5 -mr-1.5 shrink-0 cursor-help p-1.5 hover:text-foreground"
                  onPointerDownCapture={() => {
                    scopeHelpOpenAtPointerDown.current = scopeHelpOpen
                  }}
                  onClick={() => setScopeHelpOpen(!scopeHelpOpenAtPointerDown.current)}
                >
                  <CircleHelp className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[min(20rem,calc(100vw-2rem))]">
                {t('retrievePanel.querySettings.parametersScopeTooltip')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent className="m-0 flex grow flex-col p-0 text-xs">
        <div className="relative size-full">
          <div className="absolute inset-0 flex flex-col gap-3.5 overflow-auto px-2.5 pb-3">
            {/* Section 1: 核心模式与预设 */}
            <div className="rounded-xl border border-border/70 bg-muted/20 p-2.5 space-y-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground/90 border-b border-border/40 pb-1.5">
                <Sparkles className="size-3 text-emerald-400" />
                <span>核心模式与预设</span>
              </div>
            {/* User Prompt - Moved to top for better dropdown space */}
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <label htmlFor="user_prompt" className="ml-1 cursor-help">
                      {t('retrievePanel.querySettings.userPrompt')}
                    </label>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p>{t('retrievePanel.querySettings.userPromptTooltip')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <div>
                <UserPromptInputWithHistory
                  id="user_prompt"
                  value={querySettings.user_prompt || ''}
                  onChange={(value) => handleChange('user_prompt', value)}
                  onSelectFromHistory={handleSelectFromHistory}
                  onDeleteFromHistory={handleDeleteFromHistory}
                  history={userPromptHistory}
                  placeholder={t('retrievePanel.querySettings.userPromptPlaceholder')}
                  className="h-9"
                />
              </div>
              {/* Sits with the field whose meaning it changes, not with the
                  debug switches further down. */}
              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <label
                        htmlFor="disable_user_prompt_prefix"
                        className="flex-1 ml-1 cursor-help"
                      >
                        {t('retrievePanel.querySettings.disableUserPromptPrefix')}
                      </label>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p>
                        {t('retrievePanel.querySettings.disableUserPromptPrefixTooltip')}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Checkbox
                  className="mr-10 cursor-pointer"
                  id="disable_user_prompt_prefix"
                  checked={querySettings.disable_user_prompt_prefix ?? false}
                  onCheckedChange={(checked) =>
                    handleChange('disable_user_prompt_prefix', checked)
                  }
                />
              </div>
            </>

            {/* Query Mode */}
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <label htmlFor="query_mode_select" className="ml-1 cursor-help">
                      {t('retrievePanel.querySettings.queryMode')}
                    </label>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p>{t('retrievePanel.querySettings.queryModeTooltip')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <div className="flex items-center gap-1">
                <Select
                  value={querySettings.mode}
                  onValueChange={(v) => handleChange('mode', v as QueryMode)}
                >
                  <SelectTrigger
                    id="query_mode_select"
                    className={cn(
                      'hover:bg-primary/5 h-9 cursor-pointer focus:ring-0 focus:ring-offset-0 focus:outline-0 active:right-0 flex-1 text-left [&>span]:break-all [&>span]:line-clamp-1',
                      showQualityWarning &&
                        'border-red-400 bg-red-100 text-red-700 hover:bg-red-100 dark:border-red-600 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/30'
                    )}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="mix">{t('retrievePanel.querySettings.queryModeOptions.mix')}</SelectItem>
                      <SelectItem value="hybrid">{t('retrievePanel.querySettings.queryModeOptions.hybrid')}</SelectItem>
                      <SelectItem value="naive">{t('retrievePanel.querySettings.queryModeOptions.naive')}</SelectItem>
                      <SelectItem value="local">{t('retrievePanel.querySettings.queryModeOptions.local')}</SelectItem>
                      <SelectItem value="global">{t('retrievePanel.querySettings.queryModeOptions.global')}</SelectItem>
                      <SelectItem value="bypass">{t('retrievePanel.querySettings.queryModeOptions.bypass')}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <ResetButton
                  onClick={() => handleReset('mode')}
                  title="Reset to default (Mix)"
                />
              </div>
              {showQualityWarning && (
                <p className="ml-1 text-red-600 dark:text-red-400">
                  {t('retrievePanel.querySettings.queryModeWarning')}
                </p>
              )}
            </>
            </div>

            {/* Section 2: 召回配额与 Token 预算 */}
            <div className="rounded-xl border border-border/70 bg-muted/20 p-2.5 space-y-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground/90 border-b border-border/40 pb-1.5">
                <Database className="size-3 text-primary" />
                <span>召回配额与 Token</span>
              </div>

            {/* Top K */}
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <label htmlFor="top_k" className="ml-1 cursor-help">
                      {t('retrievePanel.querySettings.topK')}
                    </label>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p>{t('retrievePanel.querySettings.topKTooltip')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <div className="flex items-center gap-1">
                <Input
                  id="top_k"
                  type="number"
                  value={querySettings.top_k ?? ''}
                  onChange={(e) => {
                    const value = e.target.value
                    handleChange('top_k', value === '' ? '' : parseInt(value) || 0)
                  }}
                  onBlur={(e) => {
                    const value = e.target.value
                    if (value === '' || isNaN(parseInt(value))) {
                      handleChange('top_k', 40)
                    }
                  }}
                  min={1}
                  placeholder={t('retrievePanel.querySettings.topKPlaceholder')}
                  className="h-9 flex-1 pr-2 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                />
                <ResetButton
                  onClick={() => handleReset('top_k')}
                  title="Reset to default"
                />
              </div>
            </>

            {/* Chunk Top K */}
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <label htmlFor="chunk_top_k" className="ml-1 cursor-help">
                      {t('retrievePanel.querySettings.chunkTopK')}
                    </label>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p>{t('retrievePanel.querySettings.chunkTopKTooltip')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <div className="flex items-center gap-1">
                <Input
                  id="chunk_top_k"
                  type="number"
                  value={querySettings.chunk_top_k ?? ''}
                  onChange={(e) => {
                    const value = e.target.value
                    handleChange('chunk_top_k', value === '' ? '' : parseInt(value) || 0)
                  }}
                  onBlur={(e) => {
                    const value = e.target.value
                    if (value === '' || isNaN(parseInt(value))) {
                      handleChange('chunk_top_k', 20)
                    }
                  }}
                  min={1}
                  placeholder={t('retrievePanel.querySettings.chunkTopKPlaceholder')}
                  className="h-9 flex-1 pr-2 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                />
                <ResetButton
                  onClick={() => handleReset('chunk_top_k')}
                  title="Reset to default"
                />
              </div>
            </>

            {/* Max Entity Tokens */}
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <label htmlFor="max_entity_tokens" className="ml-1 cursor-help">
                      {t('retrievePanel.querySettings.maxEntityTokens')}
                    </label>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p>{t('retrievePanel.querySettings.maxEntityTokensTooltip')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <div className="flex items-center gap-1">
                <Input
                  id="max_entity_tokens"
                  type="number"
                  value={querySettings.max_entity_tokens ?? ''}
                  onChange={(e) => {
                    const value = e.target.value
                    handleChange('max_entity_tokens', value === '' ? '' : parseInt(value) || 0)
                  }}
                  onBlur={(e) => {
                    const value = e.target.value
                    if (value === '' || isNaN(parseInt(value))) {
                      handleChange('max_entity_tokens', 6000)
                    }
                  }}
                  min={1}
                  placeholder={t('retrievePanel.querySettings.maxEntityTokensPlaceholder')}
                  className="h-9 flex-1 pr-2 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                />
                <ResetButton
                  onClick={() => handleReset('max_entity_tokens')}
                  title="Reset to default"
                />
              </div>
            </>

            {/* Max Relation Tokens */}
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <label htmlFor="max_relation_tokens" className="ml-1 cursor-help">
                      {t('retrievePanel.querySettings.maxRelationTokens')}
                    </label>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p>{t('retrievePanel.querySettings.maxRelationTokensTooltip')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <div className="flex items-center gap-1">
                <Input
                  id="max_relation_tokens"
                  type="number"
                  value={querySettings.max_relation_tokens ?? ''}
                  onChange={(e) => {
                    const value = e.target.value
                    handleChange('max_relation_tokens', value === '' ? '' : parseInt(value) || 0)
                  }}
                  onBlur={(e) => {
                    const value = e.target.value
                    if (value === '' || isNaN(parseInt(value))) {
                      handleChange('max_relation_tokens', 8000)
                    }
                  }}
                  min={1}
                  placeholder={t('retrievePanel.querySettings.maxRelationTokensPlaceholder')}
                  className="h-9 flex-1 pr-2 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                />
                <ResetButton
                  onClick={() => handleReset('max_relation_tokens')}
                  title="Reset to default"
                />
              </div>
            </>

            {/* Max Total Tokens */}
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <label htmlFor="max_total_tokens" className="ml-1 cursor-help">
                      {t('retrievePanel.querySettings.maxTotalTokens')}
                    </label>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p>{t('retrievePanel.querySettings.maxTotalTokensTooltip')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <div className="flex items-center gap-1">
                <Input
                  id="max_total_tokens"
                  type="number"
                  value={querySettings.max_total_tokens ?? ''}
                  onChange={(e) => {
                    const value = e.target.value
                    handleChange('max_total_tokens', value === '' ? '' : parseInt(value) || 0)
                  }}
                  onBlur={(e) => {
                    const value = e.target.value
                    if (value === '' || isNaN(parseInt(value))) {
                      handleChange('max_total_tokens', 30000)
                    }
                  }}
                  min={1}
                  placeholder={t('retrievePanel.querySettings.maxTotalTokensPlaceholder')}
                  className="h-9 flex-1 pr-2 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                />
                <ResetButton
                  onClick={() => handleReset('max_total_tokens')}
                  title="Reset to default"
                />
              </div>
            </>
            </div>

            {/* Section 3: 调试与流式选项 */}
            <div className="rounded-xl border border-border/70 bg-muted/20 p-2.5 space-y-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground/90 border-b border-border/40 pb-1.5">
                <Sliders className="size-3 text-muted-foreground" />
                <span>调试与流式选项</span>
              </div>
              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <label htmlFor="enable_rerank" className="flex-1 ml-1 cursor-help">
                        {t('retrievePanel.querySettings.enableRerank')}
                      </label>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p>{t('retrievePanel.querySettings.enableRerankTooltip')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Checkbox
                  className="mr-10 cursor-pointer"
                  id="enable_rerank"
                  checked={querySettings.enable_rerank}
                  onCheckedChange={(checked) => handleChange('enable_rerank', checked)}
                />
              </div>

              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <label htmlFor="only_need_context" className="flex-1 ml-1 cursor-help">
                        {t('retrievePanel.querySettings.onlyNeedContext')}
                      </label>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p>{t('retrievePanel.querySettings.onlyNeedContextTooltip')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Checkbox
                  className="mr-10 cursor-pointer"
                  id="only_need_context"
                  checked={querySettings.only_need_context}
                  onCheckedChange={(checked) => {
                    handleChange('only_need_context', checked)
                    if (checked) {
                      handleChange('only_need_prompt', false)
                    }
                  }}
                />
              </div>

              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <label htmlFor="only_need_prompt" className="flex-1 ml-1 cursor-help">
                        {t('retrievePanel.querySettings.onlyNeedPrompt')}
                      </label>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p>{t('retrievePanel.querySettings.onlyNeedPromptTooltip')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Checkbox
                  className="mr-10 cursor-pointer"
                  id="only_need_prompt"
                  checked={querySettings.only_need_prompt}
                  onCheckedChange={(checked) => {
                    handleChange('only_need_prompt', checked)
                    if (checked) {
                      handleChange('only_need_context', false)
                    }
                  }}
                />
              </div>

              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <label htmlFor="stream" className="flex-1 ml-1 cursor-help">
                        {t('retrievePanel.querySettings.streamResponse')}
                      </label>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p>{t('retrievePanel.querySettings.streamResponseTooltip')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Checkbox
                  className="mr-10 cursor-pointer"
                  id="stream"
                  checked={querySettings.stream}
                  onCheckedChange={(checked) => handleChange('stream', checked)}
                />
              </div>
            </div>

          </div>
        </div>
      </CardContent>
    </Card>
  )
}
