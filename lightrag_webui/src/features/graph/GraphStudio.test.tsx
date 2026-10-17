// Polyfill WebGL2RenderingContext constants for Sigma in headless test runner
if (typeof (global as any).WebGL2RenderingContext === 'undefined') {
  ;(global as any).WebGL2RenderingContext = {
    BOOL: 0x8b56,
    BYTE: 0x1400,
    UNSIGNED_BYTE: 0x1401,
    SHORT: 0x1402,
    UNSIGNED_SHORT: 0x1403,
    INT: 0x1404,
    UNSIGNED_INT: 0x1405,
    FLOAT: 0x1406
  }
}

import { describe, it, expect, beforeEach, mock } from 'bun:test'
import React from 'react'

mock.module('@/features/GraphViewer', () => ({
  default: () => <div data-testid="mock-graph-viewer">Mock GraphViewer Canvas</div>
}))

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import GraphStudio from '@/features/graph/GraphStudio'
import { useGraphStore, RawGraph } from '@/stores/graph'

describe('GraphStudio Component', () => {
  beforeEach(() => {
    // 初始化 mock 假数据给 rawGraph
    const mockGraph = new RawGraph()
    mockGraph.nodes = [
      {
        id: '用户微服务',
        labels: ['Service'],
        properties: { description: '处理全站用户鉴权与元数据', source_id: 'doc-user-123' },
        size: 15,
        x: 0,
        y: 0,
        color: '#a855f7',
        degree: 5
      },
      {
        id: '知识库网关',
        labels: ['Gateway'],
        properties: { description: 'FastMCP 统一生产接口' },
        size: 18,
        x: 10,
        y: 10,
        color: '#3b82f6',
        degree: 8
      }
    ]
    mockGraph.edges = [
      {
        id: 'edge-1',
        source: '知识库网关',
        target: '用户微服务',
        type: 'DEPENDS_ON',
        properties: {},
        dynamicId: 'dynamic-1'
      }
    ]
    mockGraph.nodeIdMap = {
      用户微服务: 0,
      知识库网关: 1
    }
    mockGraph.edgeIdMap = {
      'edge-1': 0
    }
    mockGraph.buildDynamicMap()

    useGraphStore.setState({
      rawGraph: mockGraph,
      selectedNode: null,
      focusedNode: null,
      isFetching: false
    })
  })

  it('renders GraphStudio header and N-degree controls correctly', () => {
    render(<GraphStudio />)

    expect(screen.getByText('Graph Studio 2.0')).toBeInTheDocument()
    expect(screen.getByText('N-Degree Subgraph')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('搜索实体以聚焦局部拓扑...')).toBeInTheDocument()

    // 检查探索度数选择器
    expect(screen.getByText('1°')).toBeInTheDocument()
    expect(screen.getByText('2°')).toBeInTheDocument()
    expect(screen.getByText('3°')).toBeInTheDocument()
  })

  it('renders popular entities and allows selection to open details drawer', async () => {
    render(<GraphStudio />)

    // 应该展示核心关键实体
    expect(screen.getByText('核心关键实体')).toBeInTheDocument()
    expect(screen.getByText('知识库网关')).toBeInTheDocument()
    expect(screen.getByText('用户微服务')).toBeInTheDocument()

    // 点击知识库网关聚焦
    fireEvent.click(screen.getByText('知识库网关'))

    // 验证右侧抽屉滑出，展示实体详情
    await waitFor(() => {
      expect(screen.getByText('实体描述')).toBeInTheDocument()
      expect(screen.getByText('FastMCP 统一生产接口')).toBeInTheDocument()
    })
  })

  it('switches explore depth seamlessly', () => {
    render(<GraphStudio />)

    const depth3Btn = screen.getByText('3°')
    fireEvent.click(depth3Btn)
    expect(depth3Btn.className).toContain('bg-purple-600')
  })
})
