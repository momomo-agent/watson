# Watson Core Extraction — In-Project Refactor

## Goal

Refactor Watson's `src/main/` into `src/core/` (platform-agnostic runtime) + `src/electron/` (Electron shell).
The renderer stays at `src/renderer/` untouched.

## Current Structure
```
src/
  main/
    index.ts                    ← Electron entry
    domain/                     ← ChatSession, SenseLoop, SkillManager, CodingAgentSession
    infrastructure/             ← ToolRunner, ClawBridge, Config, DB, MCP, etc.
    application/                ← IPC handlers, WorkspaceManager, Schedulers, TrayManager
  renderer/                     ← Vue 3 (untouched)
  preload/                      ← Electron preload
  shared/                       ← chat-types.ts
```

## Target Structure
```
src/
  core/                         ← NEW: platform-agnostic runtime
    platform.ts                 ← WatsonPlatform interface + all adapter interfaces
    emitter.ts                  ← Minimal event emitter (replaces Node EventEmitter)
    event-bus.ts                ← Platform-agnostic event bus (replaces session-bus.ts)
    chat-session.ts             ← From domain/ — uses Emitter instead of EventEmitter
    chat-types.ts               ← From shared/ — move here
    tools.ts                    ← From infrastructure/ — pure tool definitions
    prompt-builder.ts           ← From infrastructure/ — uses FileSystemAdapter instead of fs
    claw-bridge.ts              ← From infrastructure/ — uses adapters
    workspace-manager.ts        ← From application/ — uses adapters
    agent-manager.ts            ← From infrastructure/ — uses FileSystemAdapter
    skill-manager.ts            ← From domain/ — uses adapters
    skill-parser.ts             ← From infrastructure/ — uses FileSystemAdapter
    sense-loop.ts               ← From domain/ — uses ScreenAdapter
    heartbeat-scheduler.ts      ← From application/ — uses FileSystemAdapter
    cron-scheduler.ts           ← From application/ — uses CronAdapter
    index.ts                    ← Public API: createWatsonRuntime(platform) → WatsonRuntime
  electron/                     ← NEW: Electron-specific shell
    index.ts                    ← Electron entry (from main/index.ts)
    platform/
      electron-platform.ts      ← Implements WatsonPlatform with Node.js/Electron APIs
    handlers/
      chat-handlers.ts          ← IPC bridge to core ChatSession
      workspace-handlers.ts     ← IPC bridge
      settings-handlers.ts      ← IPC bridge
      persistence-handlers.ts   ← IPC bridge
      coding-agent-handlers.ts  ← IPC bridge
      memory-handlers.ts        ← IPC bridge
      scheduler-handlers.ts     ← IPC bridge
      tray-handlers.ts          ← IPC bridge
      file-watcher-handlers.ts  ← IPC bridge
    tool-runner.ts              ← Implements ToolExecuteFn with Node.js APIs
    tray-manager.ts             ← From application/
    session-bus.ts              ← Thin wrapper: Electron BrowserWindow + core EventBus
    mcp-manager.ts              ← From infrastructure/ (Node.js child_process)
    coding-agent-executor.ts    ← From infrastructure/
    coding-agent-manager.ts     ← From infrastructure/
    coding-agent-session.ts     ← From domain/ (uses child_process)
    workspace-db.ts             ← From infrastructure/ (better-sqlite3)
    workspace-registry.ts       ← From infrastructure/ (uses Electron app.getPath)
    config.ts                   ← From infrastructure/ (uses Electron app, fs)
    file-watcher.ts             ← From infrastructure/ (chokidar)
    screen-capture.ts           ← From infrastructure/ (agent-control CLI)
    process-manager.ts          ← From infrastructure/ (child_process)
    skill-executor.ts           ← From infrastructure/ (child_process)
    skill-installer.ts          ← From infrastructure/ (child_process)
    dependency-store.ts         ← From infrastructure/ (better-sqlite3)
    memory-index.ts             ← From infrastructure/ (sqlite-vec)
    unread-store.ts             ← From infrastructure/
  renderer/                     ← UNTOUCHED
  preload/                      ← UNTOUCHED
```

## Platform Interfaces (src/core/platform.ts)

```typescript
export interface WatsonPlatform {
  storage: StorageAdapter
  fs: FileSystemAdapter
  process: ProcessAdapter
  config: ConfigAdapter
  notify: NotifyAdapter
  screen: ScreenAdapter
  cron: CronAdapter
}
```

Each adapter is async (Promise-based) so browser implementations can use IndexedDB/OPFS.

## Key Transformations

1. **EventEmitter → Emitter**: ChatSession extends custom Emitter, not Node EventEmitter
2. **fs → FileSystemAdapter**: prompt-builder, agent-manager, skill-parser use adapter
3. **better-sqlite3 → StorageAdapter**: workspace-db becomes the Electron implementation
4. **child_process → ProcessAdapter**: tool-runner, process-manager use adapter
5. **Electron app → ConfigAdapter**: config.ts becomes Electron implementation
6. **session-bus → EventBus**: platform-agnostic, push function injected
7. **node-cron → CronAdapter**: cron-scheduler uses adapter

## createWatsonRuntime Factory

```typescript
export function createWatsonRuntime(platform: WatsonPlatform, options: RuntimeOptions): WatsonRuntime
```

Returns runtime with workspace manager, event bus, schedulers, sense loop.
Electron entry creates ElectronPlatform, passes to factory, wires IPC handlers.

## Constraints

- src/core/ must have ZERO imports from 'electron', 'fs', 'path', 'child_process', 'better-sqlite3', 'events', 'os', 'util'
- src/core/ CAN import 'agentic' (the LLM library) and 'js-yaml' (pure JS)
- src/electron/ can import anything
- src/renderer/ is NOT touched at all
- src/preload/ is NOT touched at all
- shared/chat-types.ts moves to core/chat-types.ts, shared/ gets a re-export for backward compat

## electron-vite Config Update

Change main entry from `src/main/index.ts` to `src/electron/index.ts`.

## Migration Steps

1. Create src/core/ directory
2. Create platform.ts with all interfaces
3. Create emitter.ts (minimal event emitter)
4. Create event-bus.ts (from session-bus, minus Electron)
5. Move + adapt domain files to core (chat-session, sense-loop, skill-manager)
6. Move + adapt infrastructure files to core (tools, prompt-builder, claw-bridge, agent-manager, skill-parser)
7. Move + adapt application files to core (workspace-manager, heartbeat-scheduler, cron-scheduler)
8. Move chat-types.ts to core, add re-export in shared/
9. Create core/index.ts with createWatsonRuntime factory
10. Create src/electron/ directory
11. Move Electron-specific files to electron/
12. Create electron-platform.ts implementing all adapters
13. Refactor electron/index.ts to use createWatsonRuntime
14. Refactor IPC handlers to use WatsonRuntime
15. Update electron-vite config entry point
16. Verify: grep src/core/ for forbidden imports
