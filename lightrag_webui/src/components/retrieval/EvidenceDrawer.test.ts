import { describe, expect, test } from 'bun:test'
import { getGroundedEvidence } from './EvidenceDrawer'
import type { MessageWithError } from '@/types/retrieval'

describe('getGroundedEvidence — grounded facts vs LLM hallucination', () => {
  test('returns no evidence when message has no references, even if LLM hallucinated file names', () => {
    const message: MessageWithError = {
      id: 'msg-1',
      role: 'assistant',
      content: 'Here are documents: Operations.md, Release.md, and test.py',
      thinkingContent: '7 Operations.md content\n20 Release.md content\nRelationships: 40...',
      // No server-grounded references
      references: []
    }

    const evidence = getGroundedEvidence(message)
    expect(evidence.hasEvidence).toBe(false)
    expect(evidence.documents).toHaveLength(0)
    expect(evidence.totalChunks).toBe(0)
  })

  test('correctly extracts server-grounded references and actual chunks', () => {
    const message: MessageWithError = {
      id: 'msg-2',
      role: 'assistant',
      content: 'The system recovery protocol is defined below.',
      references: [
        {
          reference_id: 'ref-1',
          file_path: 'docs/ops/Operations.md',
          content: [
            'Section 1: Run systemctl restart rag-service.',
            'Section 2: Check journalctl -u rag-service -f.'
          ]
        },
        {
          reference_id: 'ref-2',
          file_path: 'config/Api.md',
          content: [
            'API endpoint on port 8001 exposes 8 tools.'
          ]
        }
      ]
    }

    const evidence = getGroundedEvidence(message)
    expect(evidence.hasEvidence).toBe(true)
    expect(evidence.documents).toHaveLength(2)

    // Document 1
    expect(evidence.documents[0].fileName).toBe('Operations.md')
    expect(evidence.documents[0].fileType).toBe('MD')
    expect(evidence.documents[0].chunks).toHaveLength(2)
    expect(evidence.documents[0].chunks[0]).toContain('Section 1')

    // Document 2
    expect(evidence.documents[1].fileName).toBe('Api.md')
    expect(evidence.documents[1].fileType).toBe('MD')
    expect(evidence.documents[1].chunks).toHaveLength(1)

    // Total chunks
    expect(evidence.totalChunks).toBe(3)
  })
})
