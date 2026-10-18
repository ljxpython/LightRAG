import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface ChatMessageItem {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  mode?: string
  references?: any[]
  responseTimeMs?: number
}

export interface ChatSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessageItem[]
  mode: string
}

interface ChatSessionState {
  sessions: ChatSession[]
  activeSessionId: string
  generatingSessionIds: string[]
  
  // Actions
  createSession: (title?: string, mode?: string) => string
  switchSession: (id: string) => void
  updateSessionTitle: (id: string, title: string) => void
  deleteSession: (id: string) => void
  clearAllSessions: () => void
  addMessageToActiveSession: (msg: Omit<ChatMessageItem, 'id' | 'timestamp'>) => void
  updateActiveSessionMessages: (messages: ChatMessageItem[]) => void
  updateSessionMessages: (sessionId: string, messages: ChatMessageItem[]) => void
  setSessionGenerating: (sessionId: string, isGenerating: boolean) => void
}

const DEFAULT_SESSION_ID = 'session-default'

const INITIAL_SESSION: ChatSession = {
  id: DEFAULT_SESSION_ID,
  title: '新对话',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  messages: [],
  mode: 'hybrid'
}

export const useChatSessionStore = create<ChatSessionState>()(
  persist(
    (set, get) => ({
      sessions: [INITIAL_SESSION],
      activeSessionId: DEFAULT_SESSION_ID,
      generatingSessionIds: [],

      createSession: (title = '新对话', mode = 'hybrid') => {
        const { sessions, activeSessionId } = get()
        // If creating a generic '新对话' and current session is already empty, reuse it
        if (title === '新对话') {
          const currentActive = sessions.find((s) => s.id === activeSessionId)
          if (currentActive && currentActive.messages.length === 0 && currentActive.title === '新对话') {
            return activeSessionId
          }
        }

        const newId = `session-${Date.now()}`
        const newSession: ChatSession = {
          id: newId,
          title,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [],
          mode
        }
        set((state) => ({
          sessions: [newSession, ...state.sessions],
          activeSessionId: newId
        }))
        return newId
      },

      switchSession: (id) => {
        const found = get().sessions.find((s) => s.id === id)
        if (found) {
          set({ activeSessionId: id })
        }
      },

      updateSessionTitle: (id, title) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, title: title.trim(), updatedAt: Date.now() } : s
          )
        }))
      },

      deleteSession: (id) => {
        set((state) => {
          const remaining = state.sessions.filter((s) => s.id !== id)
          if (remaining.length === 0) {
            const fallback: ChatSession = {
              id: `session-${Date.now()}`,
              title: '新对话',
              createdAt: Date.now(),
              updatedAt: Date.now(),
              messages: [],
              mode: 'hybrid'
            }
            return {
              sessions: [fallback],
              activeSessionId: fallback.id
            }
          }
          return {
            sessions: remaining,
            activeSessionId:
              state.activeSessionId === id ? remaining[0].id : state.activeSessionId
          }
        })
      },

      clearAllSessions: () => {
        const fresh: ChatSession = {
          id: `session-${Date.now()}`,
          title: '新对话',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [],
          mode: 'hybrid'
        }
        set({
          sessions: [fresh],
          activeSessionId: fresh.id
        })
      },

      addMessageToActiveSession: (msg) => {
        const { activeSessionId } = get()
        const newMsg: ChatMessageItem = {
          ...msg,
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: Date.now()
        }

        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id === activeSessionId) {
              // 如果是第一条用户消息且标题是“新对话”，自动将提问作为标题
              let title = s.title
              if (s.messages.length === 0 && msg.role === 'user') {
                title = msg.content.trim().slice(0, 24) || s.title
              }
              return {
                ...s,
                title,
                updatedAt: Date.now(),
                messages: [...s.messages, newMsg]
              }
            }
            return s
          })
        }))
      },

      updateSessionMessages: (sessionId, messages) => {
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== sessionId) return s
            let title = s.title
            if ((title === '新对话' || title.includes('New Chat')) && messages.length > 0) {
              const firstUser = messages.find((m) => m.role === 'user')
              if (firstUser?.content) {
                const cleaned = firstUser.content.replace(/^\/(?:hybrid|global|local|naive|mix|bypass)\s+/i, '').trim()
                if (cleaned) {
                  title = `问答: ${cleaned.slice(0, 20)}`
                }
              }
            }
            return { ...s, title, messages, updatedAt: Date.now() }
          })
        }))
      },

      updateActiveSessionMessages: (messages) => {
        get().updateSessionMessages(get().activeSessionId, messages)
      },

      setSessionGenerating: (sessionId, isGenerating) => {
        set((state) => {
          const exists = state.generatingSessionIds.includes(sessionId)
          if (isGenerating && !exists) {
            return { generatingSessionIds: [...state.generatingSessionIds, sessionId] }
          }
          if (!isGenerating && exists) {
            return { generatingSessionIds: state.generatingSessionIds.filter((id) => id !== sessionId) }
          }
          return state
        })
      }
    }),
    {
      name: 'lightrag-chat-sessions',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (!state || !Array.isArray(state.sessions)) return
        // Deduplicate empty "新对话" sessions from dirty historical storage
        const cleaned: ChatSession[] = []
        let hasEmptyGeneric = false
        for (const s of state.sessions) {
          const isGeneric = s.title === '新对话' || s.title.includes('New Chat')
          const isEmpty = !s.messages || s.messages.length === 0
          if (isGeneric && isEmpty) {
            if (!hasEmptyGeneric) {
              hasEmptyGeneric = true
              cleaned.push({ ...s, title: '新对话' })
            }
          } else {
            cleaned.push(s)
          }
        }
        if (cleaned.length === 0) {
          cleaned.push(INITIAL_SESSION)
        }
        const activeExists = cleaned.some((s) => s.id === state.activeSessionId)
        state.sessions = cleaned
        state.activeSessionId = activeExists ? state.activeSessionId : cleaned[0].id
      }
    }
  )
)
