import { describe, it, expect, beforeEach } from 'vitest'
import { useChatSessionStore } from './chatSessionStore'

describe('useChatSessionStore', () => {
  beforeEach(() => {
    useChatSessionStore.setState({
      sessions: [
        {
          id: 'test-session-1',
          title: '会话 1',
          createdAt: 1000,
          updatedAt: 1000,
          messages: [],
          mode: 'hybrid'
        }
      ],
      activeSessionId: 'test-session-1'
    })
  })

  it('creates and switches session', () => {
    const id = useChatSessionStore.getState().createSession('架构讨论', 'global')
    expect(useChatSessionStore.getState().activeSessionId).toBe(id)
    const session = useChatSessionStore.getState().sessions.find((s) => s.id === id)
    expect(session?.title).toBe('架构讨论')
    expect(session?.mode).toBe('global')

    useChatSessionStore.getState().switchSession('test-session-1')
    expect(useChatSessionStore.getState().activeSessionId).toBe('test-session-1')
  })

  it('updates session title', () => {
    useChatSessionStore.getState().updateSessionTitle('test-session-1', '重构分析')
    const session = useChatSessionStore.getState().sessions.find((s) => s.id === 'test-session-1')
    expect(session?.title).toBe('重构分析')
  })

  it('deletes session and falls back to another or creates fallback', () => {
    useChatSessionStore.getState().deleteSession('test-session-1')
    expect(useChatSessionStore.getState().sessions.length).toBeGreaterThanOrEqual(1)
    expect(useChatSessionStore.getState().sessions.some((s) => s.id === 'test-session-1')).toBe(false)
  })

  it('adds message to active session and auto-names title on first user message', () => {
    const id = useChatSessionStore.getState().createSession('新对话', 'hybrid')
    useChatSessionStore.getState().addMessageToActiveSession({
      role: 'user',
      content: '请详细阐述 POSIX CAS 零锁发布机制'
    })

    const session = useChatSessionStore.getState().sessions.find((s) => s.id === id)
    expect(session?.messages.length).toBe(1)
    expect(session?.messages[0].content).toBe('请详细阐述 POSIX CAS 零锁发布机制')
    expect(session?.title).toBe('请详细阐述 POSIX CAS 零锁发布机制')
  })
})
