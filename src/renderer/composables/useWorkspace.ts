import { ref, onMounted } from 'vue'

export interface Workspace {
  id: string
  name: string
  path: string
  createdAt: number
  lastUsed: number
}

const currentWorkspace = ref<Workspace | null>(null)
const workspaces = ref<Workspace[]>([])

export function useWorkspace() {
  const loadWorkspaces = async () => {
    workspaces.value = await window.electron.invoke('workspace:list')
    currentWorkspace.value = await window.electron.invoke('workspace:current')
  }

  const switchWorkspace = async (id: string) => {
    currentWorkspace.value = await window.electron.invoke('workspace:switch', id)
  }

  const createWorkspace = async (name: string, path: string) => {
    const workspace = await window.electron.invoke('workspace:create', name, path)
    await loadWorkspaces()
    return workspace
  }

  const deleteWorkspace = async (id: string) => {
    await window.electron.invoke('workspace:delete', id)
    await loadWorkspaces()
  }

  onMounted(() => {
    loadWorkspaces()
  })

  return {
    currentWorkspace,
    workspaces,
    switchWorkspace,
    createWorkspace,
    deleteWorkspace,
    loadWorkspaces
  }
}
