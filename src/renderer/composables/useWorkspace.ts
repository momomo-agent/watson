import { ref } from 'vue'

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
  workspaces.value = await window.api.invoke('workspace:list')
  currentWorkspace.value = await window.api.invoke('workspace:current')
  
  // Load config and expose to window for voice init
  try {
    const config = await window.api.loadConfig()
    ;(window as any).__watsonConfig = config
  } catch (e) {
    console.error('[useWorkspace] config load failed:', e)
  }
}

// 立即初始化，不依赖 onMounted
loadWorkspaces().catch(e => console.error('[useWorkspace] init failed:', e))

export function useWorkspace() {
  const switchWorkspace = async (id: string) => {
    currentWorkspace.value = await window.api.invoke('workspace:switch', id)
  }

  const createWorkspace = async (name: string, path: string) => {
    const workspace = await window.api.invoke('workspace:create', name, path)
    await loadWorkspaces()
    return workspace
  }

  const deleteWorkspace = async (id: string) => {
    await window.api.invoke('workspace:delete', id)
    await loadWorkspaces()
  }

  return {
    currentWorkspace,
    workspaces,
    switchWorkspace,
    createWorkspace,
    deleteWorkspace,
    loadWorkspaces
  }
}
