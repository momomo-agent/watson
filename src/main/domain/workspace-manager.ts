import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface Workspace {
  id: string
  name: string
  path: string
  createdAt: number
  lastUsed: number
}

interface WorkspaceStore {
  current: string | null
  workspaces: Workspace[]
}

export class WorkspaceManager {
  private storePath: string
  private store: WorkspaceStore

  constructor() {
    const configDir = join(homedir(), '.watson')
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }
    this.storePath = join(configDir, 'workspaces.json')
    this.store = this.load()
  }

  private load(): WorkspaceStore {
    if (!existsSync(this.storePath)) {
      const defaultWorkspace: Workspace = {
        id: 'default',
        name: 'Default',
        path: homedir(),
        createdAt: Date.now(),
        lastUsed: Date.now()
      }
      return {
        current: 'default',
        workspaces: [defaultWorkspace]
      }
    }
    return JSON.parse(readFileSync(this.storePath, 'utf8'))
  }

  private save(): void {
    writeFileSync(this.storePath, JSON.stringify(this.store, null, 2))
  }

  listWorkspaces(): Workspace[] {
    return this.store.workspaces
  }

  getCurrentWorkspace(): Workspace | null {
    if (!this.store.current) return null
    return this.store.workspaces.find(w => w.id === this.store.current) || null
  }

  createWorkspace(name: string, path: string): Workspace {
    const workspace: Workspace = {
      id: `ws-${Date.now()}`,
      name,
      path,
      createdAt: Date.now(),
      lastUsed: Date.now()
    }
    this.store.workspaces.push(workspace)
    this.save()
    return workspace
  }

  switchWorkspace(id: string): void {
    const workspace = this.store.workspaces.find(w => w.id === id)
    if (!workspace) throw new Error(`Workspace ${id} not found`)
    
    this.store.current = id
    workspace.lastUsed = Date.now()
    this.save()
  }

  deleteWorkspace(id: string): void {
    if (id === 'default') throw new Error('Cannot delete default workspace')
    
    this.store.workspaces = this.store.workspaces.filter(w => w.id !== id)
    if (this.store.current === id) {
      this.store.current = 'default'
    }
    this.save()
  }
}
