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
  
  // Actions
  createSession: (title?: string, mode?: string) => string
  switchSession: (id: string) => void
  updateSessionTitle: (id: string, title: string) => void
  deleteSession: (id: string) => void
  clearAllSessions: () => void
  addMessageToActiveSession: (msg: Omit<ChatMessageItem, 'id' | 'timestamp'>) => void
  updateActiveSessionMessages: (messages: ChatMessageItem[]) => void
}

const DEFAULT_SESSION_ID = 'session-default'

const INITIAL_SESSION: ChatSession = {
  id: DEFAULT_SESSION_ID,
  title: '新对话 (New Chat)',
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

      createSession: (title = '新对话', mode = 'hybrid') => {
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

      updateActiveSessionMessages: (messages) => {
        const { activeSessionId } = get()
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === activeSessionId
              ? { ...s, messages, updatedAt: Date.now() }
              : s
          )
        }))
      }
    }),
    {
      name: 'lightrag-chat-sessions',
      storage: createJSONStorage(() => localStorage)
    }
  )
)
