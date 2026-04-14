/**
 * Workspace Registry — Infrastructure Layer
 *
 * Aligned with Paw's workspace-registry.js architecture:
 * - Global registry (~/.watson/workspaces.json) stores paths + current
 * - Per-workspace identity lives in <workspace>/.watson/config.json
 * - Per-workspace sessions DB lives in <workspace>/.watson/sessions.db
 * - UUID is generated once and travels with the folder
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, resolve, basename } from 'path'
import { homedir } from 'os'
import { randomUUID } from 'crypto'

// ── Types ──

export interface WorkspaceIdentity {
  id: string        // UUID, stable across moves
  name: string
  avatar?: string   // filename in .watson/ or 'preset:N'
  description?: string
}

export interface WorkspaceRecord {
  id: string
  path: string
  type: 'local' | 'coding-agent'
  engine?: string   // for coding-agent workspaces
  identity: WorkspaceIdentity
}

interface RegistryFile {
  current: string | null  // workspace id
  workspaces: Array<{ path: string; type?: string; engine?: string }>
}

// ── Constants ──

const GLOBAL_DIR = join(homedir(), '.watson')
const REGISTRY_PATH = join(GLOBAL_DIR, 'workspaces.json')
const WS_CONFIG_DIR = '.watson'
const WS_CONFIG_FILE = 'config.json'

// ── Identity (per-workspace .watson/config.json) ──

function wsConfigPath(wsPath: string): string {
  return join(wsPath, WS_CONFIG_DIR, WS_CONFIG_FILE)
}

function readWsConfig(wsPath: string): Record<string, any> {
  try {
    return JSON.parse(readFileSync(wsConfigPath(wsPath), 'utf8'))
  } catch {
    return {}
  }
}

function writeWsConfig(wsPath: string, config: Record<string, any>): void {
  const dir = join(wsPath, WS_CONFIG_DIR)
  mkdirSync(dir, { recursive: true })
  writeFileSync(wsConfigPath(wsPath), JSON.stringify(config, null, 2) + '\n')
}

export function loadIdentity(wsPath: string): WorkspaceIdentity {
  const config = readWsConfig(wsPath)
  if (!config.id) {
    config.id = randomUUID()
    writeWsConfig(wsPath, config)
  }
  return {
    id: config.id,
    name: config.name || basename(wsPath),
    avatar: config.avatar || undefined,
    description: config.description || undefined,
  }
}

export function saveIdentity(wsPath: string, updates: Partial<WorkspaceIdentity>): WorkspaceIdentity {
  const config = readWsConfig(wsPath)
  if (updates.name !== undefined) config.name = updates.name
  if (updates.avatar !== undefined) config.avatar = updates.avatar
  if (updates.description !== undefined) config.description = updates.description
  if (!config.id) config.id = randomUUID()
  writeWsConfig(wsPath, config)
  return {
    id: config.id,
    name: config.name || basename(wsPath),
    avatar: config.avatar || undefined,
    description: config.description || undefined,
  }
}

// ── Registry (global ~/.watson/workspaces.json) ──

let _workspaces: WorkspaceRecord[] = []
let _current: string | null = null

function loadRegistry(): void {
  mkdirSync(GLOBAL_DIR, { recursive: true })
  if (!existsSync(REGISTRY_PATH)) {
    _workspaces = []
    _current = null
    return
  }
  try {
    const raw: RegistryFile = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'))
    _current = raw.current || null
    _workspaces = (raw.workspaces || [])
      .filter(w => w && w.path)
      .map(w => {
        const absPath = resolve(w.path)
        const type = (w.type as any) || 'local'
        // Only hydrate local workspaces that exist on disk
        if (type === 'local' && !existsSync(absPath)) return null
        const identity = type === 'local' ? loadIdentity(absPath) : {
          id: randomUUID(),
          name: w.engine || basename(absPath),
        }
        return { id: identity.id, path: absPath, type, engine: w.engine, identity }
      })
      .filter(Boolean) as WorkspaceRecord[]
  } catch {
    _workspaces = []
    _current = null
  }
}

function saveRegistry(): void {
  mkdirSync(GLOBAL_DIR, { recursive: true })
  const data: RegistryFile = {
    current: _current,
    workspaces: _workspaces.map(w => ({
      path: w.path,
      ...(w.type !== 'local' ? { type: w.type } : {}),
      ...(w.engine ? { engine: w.engine } : {}),
    })),
  }
  writeFileSync(REGISTRY_PATH, JSON.stringify(data, null, 2) + '\n')
}

// ── Public API ──

export function initRegistry(): void {
  loadRegistry()
}

export function listWorkspaces(): WorkspaceRecord[] {
  return _workspaces
}

export function getWorkspace(id: string): WorkspaceRecord | undefined {
  return _workspaces.find(w => w.id === id)
}

export function getWorkspaceByPath(wsPath: string): WorkspaceRecord | undefined {
  const abs = resolve(wsPath)
  return _workspaces.find(w => w.path === abs)
}

export function getCurrentWorkspace(): WorkspaceRecord | null {
  if (!_current) return _workspaces[0] || null
  return _workspaces.find(w => w.id === _current) || _workspaces[0] || null
}

export function addWorkspace(wsPath: string): WorkspaceRecord {
  const abs = resolve(wsPath)
  const existing = _workspaces.find(w => w.path === abs)
  if (existing) return existing

  // Ensure .watson/ dir and identity
  const identity = loadIdentity(abs)
  const record: WorkspaceRecord = { id: identity.id, path: abs, type: 'local', identity }
  _workspaces.push(record)

  if (!_current) _current = record.id
  saveRegistry()
  return record
}

export function removeWorkspace(id: string): boolean {
  const idx = _workspaces.findIndex(w => w.id === id)
  if (idx < 0) return false
  _workspaces.splice(idx, 1)
  if (_current === id) _current = _workspaces[0]?.id || null
  saveRegistry()
  return true
}

export function switchWorkspace(id: string): WorkspaceRecord {
  const ws = _workspaces.find(w => w.id === id)
  if (!ws) throw new Error(`Workspace ${id} not found`)
  _current = id
  saveRegistry()
  return ws
}

export function createWorkspace(name: string, wsPath: string, opts?: { avatar?: string; description?: string }): WorkspaceRecord {
  const abs = resolve(wsPath)
  mkdirSync(abs, { recursive: true })

  // Initialize workspace config
  saveIdentity(abs, { name, avatar: opts?.avatar, description: opts?.description })

  // Scaffold essential files
  const agentsMd = join(abs, 'AGENTS.md')
  if (!existsSync(agentsMd)) writeFileSync(agentsMd, `# ${name}\n\nWorkspace for ${name}.\n`)
  const memoryMd = join(abs, 'MEMORY.md')
  if (!existsSync(memoryMd)) writeFileSync(memoryMd, '# Memory\n\n')

  return addWorkspace(abs)
}

export function updateIdentity(id: string, updates: Partial<WorkspaceIdentity>): WorkspaceRecord | null {
  const ws = _workspaces.find(w => w.id === id)
  if (!ws) return null
  ws.identity = saveIdentity(ws.path, updates)
  return ws
}

export function refreshAll(): void {
  _workspaces = _workspaces
    .filter(w => w.type === 'coding-agent' || existsSync(w.path))
    .map(w => {
      if (w.type === 'local') w.identity = loadIdentity(w.path)
      return w
    })
}
