import { ref } from 'vue'
import { backend } from '../infrastructure/backend'

export interface Workspace {
  id: string
  name: string
  path: string
  createdAt: number
  lastUsed: number
}

const currentWorkspace = ref<Workspace | null>(null)
const workspaces = ref<Workspace[]>([])

const loadWorkspaces = async () => {
  workspaces.value = await backend.invoke('workspace:list')
  currentWorkspace.value = await backend.invoke('workspace:current')

  // Load config for voice init etc.
  try {
    const config = await backend.invoke('settings:load')
    ;(window as any).__watsonConfig = config
  } catch (e) {
    console.error('[useWorkspace] config load failed:', e)
  }
}

loadWorkspaces().catch(e => console.error('[useWorkspace] init failed:', e))

export function useWorkspace() {
  const switchWorkspace = async (id: string) => {
    currentWorkspace.value = await backend.invoke('workspace:switch', id)
  }

  const createWorkspace = async (name: string, path: string) => {
    const workspace = await backend.invoke('workspace:create', { name, path })
    await loadWorkspaces()
    return workspace
  }

  const deleteWorkspace = async (id: string) => {
    await backend.invoke('workspace:delete', id)
    await loadWorkspaces()
  }

  return {
    currentWorkspace, workspaces,
    switchWorkspace, createWorkspace, deleteWorkspace, loadWorkspaces
  }
}
