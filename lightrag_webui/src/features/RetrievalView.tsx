import { useCallback, useState, useEffect, useMemo } from 'react'
import { useSettingsStore } from '@/stores/settings'
import { useQuerySettingsStore } from '@/stores/querySettings'
import { useWebuiRetrievalHistoryStore } from '@/stores/webuiRetrievalHistory'
import { useChatSessionStore } from '@/stores/chatSessionStore'
import { createRetrievalHistoryStore, type RetrievalHistoryStore } from '@/stores/retrievalHistory'
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

const sessionHistoryStoreCache = new Map<string, RetrievalHistoryStore>()

function getSessionHistoryStore(sessionId: string): RetrievalHistoryStore {
  if (sessionId === 'session-default') {
    return useWebuiRetrievalHistoryStore
  }
  let store = sessionHistoryStoreCache.get(sessionId)
  if (!store) {
    store = createRetrievalHistoryStore(`lightrag_hist_${sessionId}`)
    sessionHistoryStoreCache.set(sessionId, store)
  }
  return store
}

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

interface ChatBodyProps {
  sessionId: string
  isActiveSession: boolean
  isRetrievalTabActive: boolean
  prefilledPrompt: string
  setPrefilledPrompt: (p: string) => void
  onUserPromptUsed: (prompt: string) => void
  getQuerySettingsSnapshot: () => any
}

function ChatBody({
  sessionId,
  isActiveSession,
  isRetrievalTabActive,
  prefilledPrompt,
  setPrefilledPrompt,
  onUserPromptUsed,
  getQuerySettingsSnapshot
}: ChatBodyProps) {
  const { t } = useTranslation()

  const historyStore = useMemo(() => getSessionHistoryStore(sessionId), [sessionId])

  const session = useQuerySession({
    historyStore,
    getQuerySettingsSnapshot,
    onUserPromptUsed
  })

  // Sync generating status to chatSessionStore for sidebar pulse
  useEffect(() => {
    useChatSessionStore.getState().setSessionGenerating(sessionId, session.isLoading)
  }, [sessionId, session.isLoading])

  // Sync session messages to chatSessionStore whenever messages update
  useEffect(() => {
    if (session.messages.length > 0) {
      useChatSessionStore.getState().updateSessionMessages(sessionId, session.messages)
    }
  }, [sessionId, session.messages])

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
    [getQuerySettingsSnapshot, session, t, setPrefilledPrompt]
  )

  const handleClear = useCallback(() => {
    session.clearMessages()
    setPrefilledPrompt('')
    useChatSessionStore.getState().updateSessionMessages(sessionId, [])
  }, [session, sessionId, setPrefilledPrompt])

  return (
    <div className="flex grow flex-col gap-3 min-w-0">
      <MessageList
        messages={session.messages}
        isLoading={session.isLoading}
        queryProgress={session.queryProgress}
        isActive={isActiveSession && isRetrievalTabActive}
        emptyState={<StarterHub onSelectPrompt={setPrefilledPrompt} />}
      />
      {isActiveSession && (
        <QueryComposer
          isLoading={session.isLoading}
          stopDisabled={session.stopDisabled}
          onSend={handleSend}
          onStop={session.handleStop}
          onClear={handleClear}
          prefilledPrompt={prefilledPrompt}
        />
      )}
    </div>
  )
}

/**
 * The ADMIN query page: composes the shared query session, message list and
 * composer with the QuerySettings sidebar and the `/mode` prefix override.
 * Upgraded with multi-session keepalive drawer and RAG Playground split-view comparison.
 */
export default function RetrievalView() {
  const currentTab = useSettingsStore.use.currentTab()
  const isRetrievalTabActive = currentTab === 'retrieval'
  const [prefilledPrompt, setPrefilledPrompt] = useState<string>('')
  const [studioMode, setStudioMode] = useState<'chat' | 'playground'>('chat')

  // Unified settings collapse state (defaults to expanded)
  const [isSettingsCollapsed, setIsSettingsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('lightrag_retrieval_sidebar_collapsed') === 'true'
    } catch {
      return false
    }
  })

  const toggleSettingsCollapsed = useCallback(() => {
    setIsSettingsCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('lightrag_retrieval_sidebar_collapsed', String(next))
      } catch {}
      return next
    })
  }, [])

  const sessions = useChatSessionStore((state) => state.sessions)
  const activeSessionId = useChatSessionStore((state) => state.activeSessionId)
  const generatingSessionIds = useChatSessionStore((state) => state.generatingSessionIds)
  const createSession = useChatSessionStore((state) => state.createSession)
  const switchSession = useChatSessionStore((state) => state.switchSession)
  const currentMode = useQuerySettingsStore((state) => state.querySettings.mode)

  // Mount only active session and sessions that are actively generating in background
  const mountedSessions = useMemo(() => {
    return sessions.filter(
      (s) => s.id === activeSessionId || generatingSessionIds.includes(s.id)
    )
  }, [sessions, activeSessionId, generatingSessionIds])

  const getQuerySettingsSnapshot = useCallback(
    () => useQuerySettingsStore.getState().querySettings,
    []
  )

  const onUserPromptUsed = useCallback((prompt: string) => {
    useSettingsStore.getState().addUserPromptToHistory(prompt)
  }, [])

  const handleSelectSession = useCallback((sessionId: string) => {
    switchSession(sessionId)
    setPrefilledPrompt('')
  }, [switchSession])

  const handleNewSession = useCallback(() => {
    const active = useChatSessionStore.getState().sessions.find((s) => s.id === activeSessionId)
    if (active && active.messages.length === 0 && active.title === '新对话') {
      return
    }
    const newId = createSession('新对话', currentMode)
    switchSession(newId)
    setPrefilledPrompt('')
  }, [activeSessionId, createSession, currentMode, switchSession])

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
          {/* 左侧多会话抽屉 */}
          <SessionManager
            onNewSession={handleNewSession}
            onSelectSession={handleSelectSession}
          />

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

              {/* 仅展示当前生效模式小标签，彻底去除冗余的‘参数配置 MIX’点击按钮 */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground font-mono">模式:</span>
                <span className="rounded bg-muted/60 border border-border/60 px-2 py-0.5 font-mono text-[10px] text-foreground uppercase font-semibold">
                  {currentMode}
                </span>
              </div>
            </div>

            {/* 会话保活容器：仅激活会话与后台生成中会话挂载，切出时不卸载，后台持续接收 token 流 */}
            <div className="flex grow flex-col min-w-0 overflow-hidden relative">
              {mountedSessions.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    'size-full flex-col min-w-0',
                    s.id === activeSessionId ? 'flex' : 'hidden'
                  )}
                >
                  <ChatBody
                    sessionId={s.id}
                    isActiveSession={s.id === activeSessionId}
                    isRetrievalTabActive={isRetrievalTabActive}
                    prefilledPrompt={s.id === activeSessionId ? prefilledPrompt : ''}
                    setPrefilledPrompt={setPrefilledPrompt}
                    onUserPromptUsed={onUserPromptUsed}
                    getQuerySettingsSnapshot={getQuerySettingsSnapshot}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 右侧可一键收起的配置面板 */}
          <QuerySettings
            collapsed={isSettingsCollapsed}
            onToggleCollapse={toggleSettingsCollapsed}
          />
        </>
      )}
    </div>
  )
}
