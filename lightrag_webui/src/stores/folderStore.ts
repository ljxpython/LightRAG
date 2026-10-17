import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface KnowledgeFolder {
  id: string
  name: string
  description?: string
  icon?: string
  color?: string
  createdAt: number
}

interface FolderState {
  folders: KnowledgeFolder[]
  activeFolderId: string | null // null 表示 "全部文档 (All)"
  docFolderMap: Record<string, string> // docId -> folderId
  docTagsMap: Record<string, string[]> // docId -> tags[]
  
  // Actions
  setActiveFolder: (folderId: string | null) => void
  createFolder: (name: string, description?: string, color?: string) => string
  updateFolder: (id: string, name: string, description?: string) => void
  deleteFolder: (id: string) => void
  assignDocToFolder: (docId: string, folderId: string | null) => void
  assignDocsToFolder: (docIds: string[], folderId: string | null) => void
  setDocTags: (docId: string, tags: string[]) => void
  addDocTag: (docId: string, tag: string) => void
  removeDocTag: (docId: string, tag: string) => void
}

const DEFAULT_FOLDERS: KnowledgeFolder[] = [
  {
    id: 'folder-ops',
    name: 'Operations Spec',
    description: '线上运维规范、发布流程与应急手册',
    color: 'emerald',
    createdAt: 1718000000000
  },
  {
    id: 'folder-api',
    name: 'API Contracts',
    description: '核心微服务接口协议与 FastMCP 工具契约',
    color: 'blue',
    createdAt: 1718000001000
  },
  {
    id: 'folder-arch',
    name: 'Architecture',
    description: 'LightRAG 生产架构设计与存储拓扑',
    color: 'indigo',
    createdAt: 1718000002000
  },
  {
    id: 'folder-guides',
    name: 'Product Guides',
    description: '产品使用指导与用户 FAQ',
    color: 'amber',
    createdAt: 1718000003000
  }
]

export const useFolderStore = create<FolderState>()(
  persist(
    (set, get) => ({
      folders: DEFAULT_FOLDERS,
      activeFolderId: null,
      docFolderMap: {},
      docTagsMap: {},

      setActiveFolder: (folderId) => set({ activeFolderId: folderId }),

      createFolder: (name, description, color = 'emerald') => {
        const id = `folder-${Date.now()}`
        const newFolder: KnowledgeFolder = {
          id,
          name: name.trim(),
          description: description?.trim(),
          color,
          createdAt: Date.now()
        }
        set((state) => ({
          folders: [...state.folders, newFolder]
        }))
        return id
      },

      updateFolder: (id, name, description) => {
        set((state) => ({
          folders: state.folders.map((f) =>
            f.id === id
              ? { ...f, name: name.trim(), description: description?.trim() }
              : f
          )
        }))
      },

      deleteFolder: (id) => {
        set((state) => {
          // 清理该文件夹内的文档映射
          const newDocFolderMap = { ...state.docFolderMap }
          for (const [docId, fId] of Object.entries(newDocFolderMap)) {
            if (fId === id) {
              delete newDocFolderMap[docId]
            }
          }
          return {
            folders: state.folders.filter((f) => f.id !== id),
            activeFolderId: state.activeFolderId === id ? null : state.activeFolderId,
            docFolderMap: newDocFolderMap
          }
        })
      },

      assignDocToFolder: (docId, folderId) => {
        set((state) => {
          const newMap = { ...state.docFolderMap }
          if (folderId === null) {
            delete newMap[docId]
          } else {
            newMap[docId] = folderId
          }
          return { docFolderMap: newMap }
        })
      },

      assignDocsToFolder: (docIds, folderId) => {
        set((state) => {
          const newMap = { ...state.docFolderMap }
          for (const docId of docIds) {
            if (folderId === null) {
              delete newMap[docId]
            } else {
              newMap[docId] = folderId
            }
          }
          return { docFolderMap: newMap }
        })
      },

      setDocTags: (docId, tags) => {
        set((state) => ({
          docTagsMap: {
            ...state.docTagsMap,
            [docId]: Array.from(new Set(tags))
          }
        }))
      },

      addDocTag: (docId, tag) => {
        const current = get().docTagsMap[docId] || []
        if (!current.includes(tag)) {
          set((state) => ({
            docTagsMap: {
              ...state.docTagsMap,
              [docId]: [...current, tag]
            }
          }))
        }
      },

      removeDocTag: (docId, tag) => {
        const current = get().docTagsMap[docId] || []
        set((state) => ({
          docTagsMap: {
            ...state.docTagsMap,
            [docId]: current.filter((t) => t !== tag)
          }
        }))
      }
    }),
    {
      name: 'lightrag-knowledge-folders',
      storage: createJSONStorage(() => localStorage)
    }
  )
)
