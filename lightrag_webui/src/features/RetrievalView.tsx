import { useCallback, useState } from 'react'
import { useSettingsStore } from '@/stores/settings'
import { useQuerySettingsStore } from '@/stores/querySettings'
import { useWebuiRetrievalHistoryStore } from '@/stores/webuiRetrievalHistory'
import QuerySettings from '@/components/retrieval/QuerySettings'
import MessageList from '@/features/retrieval/MessageList'
import QueryComposer from '@/features/retrieval/QueryComposer'
import { useQuerySession } from '@/features/retrieval/useQuerySession'
import { useTranslation } from 'react-i18next'
import { prepareQueryInput, SUPPORTED_QUERY_MODES } from '@/features/retrieval/queryInput'
import { ZapIcon, ArrowRightIcon } from 'lucide-react'

function StarterHub({ onSelectPrompt }: { onSelectPrompt: (prompt: string) => void }) {
  const { t } = useTranslation()
  const starterPrompts = [
    {
      badge: 'Hybrid 混合',
      title: '综合知识图谱与文档切片',
      prompt: '/hybrid 结合知识图谱全局关系与文档切片，全面总结当前系统的关键架构'
    },
    {
      badge: 'Global 全局',
      title: '全局实体与宏观拓扑研判',
      prompt: '/global 扫描全局实体网络，提炼当前知识库的核心主题与实体分布'
    },
    {
      badge: 'Local 局部',
      title: '局部高精实体依赖下钻',
      prompt: '/local 深入分析目标实体的核心依赖、属性细节及关键关联'
    },
    {
      badge: 'Mix 融合',
      title: '多层次知识融合问答',
      prompt: '/mix 梳理各模块之间的调用链路与技术选型合理性'
    }
  ]

  return (
    <div className="flex max-w-2xl flex-col items-center justify-center gap-6 px-4 py-8 text-center select-none">
      <div className="flex flex-col items-center gap-2.5">
        <div className="flex size-11 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-400 shadow-xs">
          <ZapIcon className="size-5.5 text-emerald-400" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
            LightRAG 知识图谱智能检索
          </h2>
          <p className="text-xs text-muted-foreground">
            {t('retrievePanel.retrieval.startPrompt')}
          </p>
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2 text-left">
        {starterPrompts.map((item, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelectPrompt(item.prompt)}
            className="group flex flex-col gap-1.5 rounded-xl border border-border/70 bg-card/50 p-3 transition-all hover:border-emerald-500/40 hover:bg-card/90 hover:shadow-xs active:scale-[0.99] text-left cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="rounded-md border border-border/60 bg-muted/50 px-2 py-0.5 text-[10px] font-mono text-muted-foreground group-hover:text-emerald-400 group-hover:border-emerald-500/30 transition-colors">
                {item.badge}
              </span>
              <ArrowRightIcon className="size-3.5 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-400" />
            </div>
            <div className="text-xs font-medium text-foreground">
              {item.title}
            </div>
            <div className="text-[11px] text-muted-foreground/80 line-clamp-1 font-mono">
              {item.prompt}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * The ADMIN query page: composes the shared query session, message list and
 * composer with the QuerySettings sidebar and the `/mode` prefix override.
 * Its history storage is the admin entry's own store; the settings snapshot
 * is passed through unmodified (including the `only_need_*` debug switches —
 * those are clamped only on the workspace page).
 */
export default function RetrievalView() {
  const { t } = useTranslation()
  // Get current tab to determine if this tab is active (for performance optimization)
  const currentTab = useSettingsStore.use.currentTab()
  const isRetrievalTabActive = currentTab === 'retrieval'
  const [prefilledPrompt, setPrefilledPrompt] = useState<string>('')

  const getQuerySettingsSnapshot = useCallback(
    () => useQuerySettingsStore.getState().querySettings,
    []
  )

  const onUserPromptUsed = useCallback((prompt: string) => {
    useSettingsStore.getState().addUserPromptToHistory(prompt)
  }, [])

  const session = useQuerySession({
    historyStore: useWebuiRetrievalHistoryStore,
    getQuerySettingsSnapshot,
    onUserPromptUsed
  })

  // A leading `/mode ` prefix overrides the query mode for this one request.
  // The workspace entry uses the same shared preparation contract.
  const handleSend = useCallback(
    (input: string): string | null => {
      const prepared = prepareQueryInput(input, getQuerySettingsSnapshot().mode)
      if (!prepared.ok) {
        return t(`retrievePanel.retrieval.${prepared.error}`, {
          modes: SUPPORTED_QUERY_MODES.join(', ')
        })
      }

      setPrefilledPrompt('')
      // The displayed user message keeps the original input (prefix and all);
      // the request carries the stripped query — same as before extraction.
      void session.submitQuery(prepared.query, {
        modeOverride: prepared.modeOverride,
        displayedInput: input
      })
      return null
    },
    [getQuerySettingsSnapshot, session, t]
  )

  const handleClear = useCallback(() => {
    session.clearMessages()
    setPrefilledPrompt('')
  }, [session])

  // Match DocumentManager's 24px content padding plus its 8px inner-card
  // margin. The resulting 32px clearance also stays above StatusIndicator.
  return (
    <div className="flex size-full gap-3 overflow-hidden px-2 pb-8">
      <div className="flex grow flex-col gap-3 min-w-0">
        <MessageList
          messages={session.messages}
          isLoading={session.isLoading}
          queryProgress={session.queryProgress}
          isActive={isRetrievalTabActive}
          emptyState={
            <StarterHub onSelectPrompt={setPrefilledPrompt} />
          }
        />
        <QueryComposer
          isLoading={session.isLoading}
          stopDisabled={session.stopDisabled}
          onSend={handleSend}
          onStop={session.handleStop}
          onClear={handleClear}
          prefilledPrompt={prefilledPrompt}
        />
      </div>
      <QuerySettings />
    </div>
  )
}
