import { create } from 'zustand'

interface WorkspaceState {
  workspaceEpoch: number
  currentTenantId: string
  currentProjectId: string
  bumpEpoch: () => void
  setCurrentWorkspace: (tenantId: string, projectId: string) => void
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaceEpoch: 0,
  currentTenantId: '__default',
  currentProjectId: '11111111-1111-4111-8111-111111111111',
  bumpEpoch: () => set((state) => ({ workspaceEpoch: state.workspaceEpoch + 1 })),
  setCurrentWorkspace: (tenantId: string, projectId: string) =>
    set((state) => ({
      currentTenantId: tenantId,
      currentProjectId: projectId,
      workspaceEpoch: state.workspaceEpoch + 1
    }))
}))
