import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface WorkspaceState {
  workspaceEpoch: number
  currentTenantId: string
  currentProjectId: string
  bumpEpoch: () => void
  setCurrentWorkspace: (tenantId: string, projectId: string) => void
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
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
    }),
    {
      name: 'lightrag-workspace-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        currentTenantId: state.currentTenantId,
        currentProjectId: state.currentProjectId
      })
    }
  )
)
