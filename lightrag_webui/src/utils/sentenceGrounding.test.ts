import { describe, expect, test } from 'bun:test'
import {
  extractSignificantKeywords,
  splitTextIntoSentences,
  groundChunkSentences,
  compactReferenceChunk
} from './sentenceGrounding'

describe('sentenceGrounding — precision sentence extraction & alignment', () => {
  test('extractSignificantKeywords normalizes Chinese and English terms and filters stop words', () => {
    const text = 'get_agent 是 LangGraph 的核心入口函数，注意配置 runtime_model。'
    const kws = extractSignificantKeywords(text)

    expect(kws.has('get_agent')).toBe(true)
    expect(kws.has('langgraph')).toBe(true)
    expect(kws.has('runtime_model')).toBe(true)
    expect(kws.has('入口函数')).toBe(true)
    expect(kws.has('核心')).toBe(true)
    // Common stop words should be stripped
    expect(kws.has('的')).toBe(false)
    expect(kws.has('是')).toBe(false)
  })

  test('splitTextIntoSentences splits without losing any original characters', () => {
    const text = '第一句话。第二句话！Third sentence? 最后一句话没有标点'
    const sentences = splitTextIntoSentences(text)

    expect(sentences.length).toBe(4)
    expect(sentences[0]).toBe('第一句话。')
    expect(sentences[1]).toBe('第二句话！')
    expect(sentences[2]).toBe('Third sentence?')
    expect(sentences[3]).toBe(' 最后一句话没有标点')
    // Concatenation must perfectly recreate original text
    expect(sentences.join('')).toBe(text)
  })

  test('groundChunkSentences correctly identifies and highlights the core evidence sentence', () => {
    const chunk = `
系统架构概述。
本项目采用 FastMCP 4.1.0 搭建微服务网关，支持双轨并行。
get_agent 是 LangGraph 的统一入口函数，签名必须为 async def get_agent(config)。
配置项中严禁直接篡改 context，否则会抛出 context_hash_mismatch 异常。
部署需通过 systemd 服务常驻运行。
`.trim()

    const query = 'agent开发应该注意什么，特别是入口函数'
    const answer = '在开发 Agent 时，get_agent 是 LangGraph 的统一入口函数，务必按照 async def 规范编写。'

    const analysis = groundChunkSentences(chunk, query, answer)

    expect(analysis.hasHighlightedSentence).toBe(true)
    expect(analysis.coreSentence).not.toBeNull()
    expect(analysis.coreSentence?.text).toContain('get_agent 是 LangGraph 的统一入口函数')
    expect(analysis.coreSentence?.isCoreEvidence).toBe(true)
  })

  test('compactReferenceChunk bounds oversized text chunk while preserving core sentence', () => {
    const longChunk = '无关前言背景介绍。'.repeat(30) +
      ' 核心结论：禁止在 configurable 中直接传递 tools 参数。' +
      ' 补充后续无意义内容。'.repeat(30)

    const query = 'configurable 参数安全红线'
    const answer = '严禁在 configurable 中传参 tools。'

    const compacted = compactReferenceChunk(longChunk, query, answer, 200)

    expect(compacted.length).toBeLessThanOrEqual(200)
    expect(compacted).toContain('禁止在 configurable 中直接传递 tools 参数')
    expect(compacted.startsWith('...')).toBe(true)
  })
})
