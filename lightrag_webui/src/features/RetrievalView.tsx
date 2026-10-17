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
import EnterpriseLogo from '@/components/layout/EnterpriseLogo'
import SessionManager from '@/features/retrieval/SessionManager'
import RagPlayground from '@/features/retrieval/RagPlayground'
import { MessagesSquare, SplitSquareVertical, ArrowRightIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

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
        <EnterpriseLogo size={42} />
        <div className="space-y-1">
          <h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
            企业级知识图谱智能检索工作台
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
            className="group flex flex-col gap-1.5 rounded-xl border border-border/70 bg-card/50 p-3 transition-all hover:border-primary/40 hover:bg-card/90 hover:shadow-xs active:scale-[0.99] text-left cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="rounded-md border border-border/60 bg-muted/50 px-2 py-0.5 text-[10px] font-mono text-muted-foreground group-hover:text-primary group-hover:border-primary/30 transition-colors">
                {item.badge}
              </span>
              <ArrowRightIcon className="size-3.5 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
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
 * Upgraded with multi-session drawer and RAG Playground split-view comparison.
 */
export default function RetrievalView() {
  const { t } = useTranslation()
  const currentTab = useSettingsStore.use.currentTab()
  const isRetrievalTabActive = currentTab === 'retrieval'
  const [prefilledPrompt, setPrefilledPrompt] = useState<string>('')
  const [studioMode, setStudioMode] = useState<'chat' | 'playground'>('chat')

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

  const handleSend = useCallback(
    (input: string): string | null => {
      const prepared = prepareQueryInput(input, getQuerySettingsSnapshot().mode)
      if (!prepared.ok) {
        return t(`retrievePanel.retrieval.${prepared.error}`, {
          modes: SUPPORTED_QUERY_MODES.join(', ')
        })
      }

      setPrefilledPrompt('')
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

  return (
    <div className="flex size-full gap-3 overflow-hidden px-2 pb-8">
      {studioMode === 'playground' ? (
        <div className="flex flex-col size-full overflow-hidden">
          <div className="flex items-center justify-between pb-2 shrink-0 select-none border-b border-border/40 mb-2">
            <div className="flex items-center gap-1.5 bg-muted/50 p-0.5 rounded-lg border border-border/60 text-xs">
              <button
                type="button"
                onClick={() => setStudioMode('chat')}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md font-medium text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <MessagesSquare className="size-3.5" />
                <span>智能问答 (Chat Studio)</span>
              </button>
              <button
                type="button"
                onClick={() => setStudioMode('playground')}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md font-semibold bg-background text-foreground shadow-2xs cursor-pointer"
              >
                <SplitSquareVertical className="size-3.5" />
                <span>对比实验台 (Playground)</span>
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <RagPlayground />
          </div>
        </div>
      ) : (
        <>
          {/* 左侧多会话抽屉 (Task 3.1) */}
          <SessionManager onNewSession={handleClear} />

          {/* 中间对话流与模式切换 */}
          <div className="flex grow flex-col gap-2 min-w-0">
            <div className="flex items-center justify-between shrink-0 select-none pb-0.5">
              <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-md border border-border/50 text-[11px]">
                <button
                  type="button"
                  onClick={() => setStudioMode('chat')}
                  className="flex items-center gap-1 px-2.5 py-0.5 rounded font-medium bg-background text-foreground shadow-2xs cursor-pointer"
                >
                  <MessagesSquare className="size-3" />
                  <span>问答工作台</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStudioMode('playground')}
                  className="flex items-center gap-1 px-2.5 py-0.5 rounded font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <SplitSquareVertical className="size-3" />
                  <span>对比实验台</span>
                </button>
              </div>
            </div>

            <div className="flex grow flex-col gap-3 min-w-0">
              <MessageList
                messages={session.messages}
                isLoading={session.isLoading}
                queryProgress={session.queryProgress}
                isActive={isRetrievalTabActive}
                emptyState={<StarterHub onSelectPrompt={setPrefilledPrompt} />}
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
          </div>

          {/* 右侧配置面板 */}
          <QuerySettings />
        </>
      )}
    </div>
  )
}
