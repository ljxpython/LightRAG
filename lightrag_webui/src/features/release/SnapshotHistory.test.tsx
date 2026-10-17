import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import SnapshotHistory from '@/features/release/SnapshotHistory'

describe('SnapshotHistory Component', () => {
  beforeEach(() => {
    // Mock fetch for /ops/snapshots
    global.fetch = mock((url: string, options?: any) => {
      if (url.includes('/ops/snapshots/rollback')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'success', active_version: 'rev_1' })
        }) as any
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            snapshots: [
              {
                revision: 'rev_2',
                is_sealed: true,
                is_valid: true,
                integrity_errors: []
              },
              {
                revision: 'rev_1',
                is_sealed: true,
                is_valid: true,
                integrity_errors: []
              }
            ]
          })
      }) as any
    })
  })

  it('renders snapshot history items correctly', async () => {
    render(<SnapshotHistory activeVersion="rev_2" />)

    await waitFor(() => {
      expect(screen.getByText('rev_2')).toBeInTheDocument()
      expect(screen.getByText('rev_1')).toBeInTheDocument()
    })

    // Active version should show Active badge
    expect(screen.getByText('当前激活 (Active)')).toBeInTheDocument()
    // Other version should show rollback button
    expect(screen.getByText('回滚至此版本')).toBeInTheDocument()
  })

  it('opens confirmation dialog when rollback button clicked', async () => {
    render(<SnapshotHistory activeVersion="rev_2" />)

    await waitFor(() => {
      expect(screen.getByText('回滚至此版本')).toBeInTheDocument()
    })

    const rollbackBtn = screen.getByText('回滚至此版本')
    fireEvent.click(rollbackBtn)

    await waitFor(() => {
      expect(screen.getByText(/确认原子回滚至 rev_1/)).toBeInTheDocument()
    })
  })
})
