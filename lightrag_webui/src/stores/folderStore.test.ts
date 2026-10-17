import { describe, it, expect, beforeEach } from 'vitest'
import { useFolderStore } from './folderStore'

describe('useFolderStore', () => {
  beforeEach(() => {
    // Reset state before each test
    useFolderStore.setState({
      folders: [
        { id: 'f-1', name: 'Folder 1', createdAt: 1000 },
        { id: 'f-2', name: 'Folder 2', createdAt: 2000 }
      ],
      activeFolderId: null,
      docFolderMap: {},
      docTagsMap: {}
    })
  })

  it('allows selecting active folder and resetting to all', () => {
    expect(useFolderStore.getState().activeFolderId).toBeNull()
    useFolderStore.getState().setActiveFolder('f-1')
    expect(useFolderStore.getState().activeFolderId).toBe('f-1')
    useFolderStore.getState().setActiveFolder(null)
    expect(useFolderStore.getState().activeFolderId).toBeNull()
  })

  it('creates and updates a new folder', () => {
    const id = useFolderStore.getState().createFolder('New Spec', 'Test description', 'blue')
    const folder = useFolderStore.getState().folders.find((f) => f.id === id)
    expect(folder).toBeDefined()
    expect(folder?.name).toBe('New Spec')
    expect(folder?.color).toBe('blue')

    useFolderStore.getState().updateFolder(id, 'Updated Spec', 'New desc')
    const updated = useFolderStore.getState().folders.find((f) => f.id === id)
    expect(updated?.name).toBe('Updated Spec')
    expect(updated?.description).toBe('New desc')
  })

  it('deletes a folder and clears document bindings and active state', () => {
    useFolderStore.getState().setActiveFolder('f-1')
    useFolderStore.getState().assignDocToFolder('doc-101', 'f-1')
    useFolderStore.getState().assignDocToFolder('doc-102', 'f-2')

    useFolderStore.getState().deleteFolder('f-1')

    expect(useFolderStore.getState().folders.some((f) => f.id === 'f-1')).toBe(false)
    expect(useFolderStore.getState().activeFolderId).toBeNull()
    expect(useFolderStore.getState().docFolderMap['doc-101']).toBeUndefined()
    expect(useFolderStore.getState().docFolderMap['doc-102']).toBe('f-2')
  })

  it('assigns multiple documents to a folder', () => {
    useFolderStore.getState().assignDocsToFolder(['doc-1', 'doc-2', 'doc-3'], 'f-2')
    expect(useFolderStore.getState().docFolderMap['doc-1']).toBe('f-2')
    expect(useFolderStore.getState().docFolderMap['doc-2']).toBe('f-2')
    expect(useFolderStore.getState().docFolderMap['doc-3']).toBe('f-2')

    useFolderStore.getState().assignDocsToFolder(['doc-1', 'doc-2'], null)
    expect(useFolderStore.getState().docFolderMap['doc-1']).toBeUndefined()
    expect(useFolderStore.getState().docFolderMap['doc-2']).toBeUndefined()
    expect(useFolderStore.getState().docFolderMap['doc-3']).toBe('f-2')
  })

  it('manages document tags cleanly', () => {
    useFolderStore.getState().addDocTag('doc-1', 'Architecture')
    useFolderStore.getState().addDocTag('doc-1', 'High-Priority')
    // duplicate should not add twice
    useFolderStore.getState().addDocTag('doc-1', 'Architecture')

    expect(useFolderStore.getState().docTagsMap['doc-1']).toEqual(['Architecture', 'High-Priority'])

    useFolderStore.getState().removeDocTag('doc-1', 'Architecture')
    expect(useFolderStore.getState().docTagsMap['doc-1']).toEqual(['High-Priority'])
  })
})
