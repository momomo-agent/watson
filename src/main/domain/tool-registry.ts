/**
 * Tool Registry — Domain Layer
 *
 * Two-tier tool loading inspired by Claude Code's ToolSearch:
 * - Core tools: always loaded, full schema in every API call
 * - Deferred tools: name + one-line hint only, loaded on demand via tool_search
 *
 * Warmup: on session start, predict which deferred tools the user likely needs
 * based on workspace context (language, frameworks, recent tool usage) and
 * pre-load them so the first turn doesn't waste a round-trip on ToolSearch.
 */

import { EventEmitter } from 'events'

// ── Types ──────────────────────────────────────────────────────

export interface ToolDef {
  name: string
  description: string
  input_schema: Record<string, any>
  /** One-line hint shown when deferred (model sees this, not full description) */
  searchHint?: string
  /** If true, always loaded — never deferred */
  core?: boolean
  /** If true, explicitly deferred even if not MCP */
  shouldDefer?: boolean
  /** Tags for warmup prediction */
  tags?: string[]
}

export interface ToolSearchResult {
  matches: ToolDef[]
  query: string
  totalDeferred: number
}

// ── Registry ───────────────────────────────────────────────────

export class ToolRegistry extends EventEmitter {
  private allTools = new Map<string, ToolDef>()
  private loadedTools = new Set<string>()
  /** Tools loaded via warmup (for analytics) */
  private warmedUp = new Set<string>()
  /** Usage count per tool (for future warmup prediction) */
  private usageCount = new Map<string, number>()

  // ── Registration ─────────────────────────────────────────────

  register(tool: ToolDef): void {
    this.allTools.set(tool.name, tool)
    if (this.isCore(tool)) {
      this.loadedTools.add(tool.name)
    }
  }

  registerAll(tools: ToolDef[]): void {
    for (const t of tools) this.register(t)
  }

  // ── Core vs Deferred ─────────────────────────────────────────

  private isCore(tool: ToolDef): boolean {
    if (tool.core) return true
    if (tool.shouldDefer) return false
    // MCP tools are always deferred
    if (tool.name.startsWith('mcp__')) return false
    return false
  }

  /** Tools with full schema — sent to API every turn */
  getCoreTools(): ToolDef[] {
    return [...this.allTools.values()].filter(t => this.isCore(t))
  }

  /** Tools that are registered but not yet loaded */
  getDeferredTools(): ToolDef[] {
    return [...this.allTools.values()].filter(t => !this.isCore(t) && !this.loadedTools.has(t.name))
  }

  /** All currently loaded tools (core + explicitly loaded) */
  getLoadedTools(): ToolDef[] {
    return [...this.allTools.values()].filter(t => this.loadedTools.has(t.name))
  }

  /** Deferred tool names + hints for system prompt */
  getDeferredToolList(): Array<{ name: string; hint: string }> {
    return this.getDeferredTools().map(t => ({
      name: t.name,
      hint: t.searchHint || t.description.slice(0, 80),
    }))
  }

  // ── Search ───────────────────────────────────────────────────

  /**
   * Search for tools by query. Three modes:
   * - "select:name1,name2" — exact selection
   * - "+required keyword" — name must contain 'required'
   * - "keyword search" — BM25-style scoring
   */
  search(query: string, maxResults = 5): ToolSearchResult {
    const deferred = this.getDeferredTools()

    // select: mode
    const selectMatch = query.match(/^select:(.+)$/i)
    if (selectMatch) {
      const names = selectMatch[1].split(',').map(s => s.trim().toLowerCase())
      const matches = names
        .map(n => this.allTools.get(n) || [...this.allTools.values()].find(t => t.name.toLowerCase() === n))
        .filter((t): t is ToolDef => !!t)
      return { matches, query, totalDeferred: deferred.length }
    }

    // Keyword search
    const queryLower = query.toLowerCase().trim()
    const terms = queryLower.split(/\s+/).filter(Boolean)

    const requiredTerms: string[] = []
    const optionalTerms: string[] = []
    for (const term of terms) {
      if (term.startsWith('+') && term.length > 1) {
        requiredTerms.push(term.slice(1))
      } else {
        optionalTerms.push(term)
      }
    }

    const allTerms = [...requiredTerms, ...optionalTerms]
    const candidates = requiredTerms.length > 0
      ? deferred.filter(t => {
          const nameLower = t.name.toLowerCase()
          const descLower = t.description.toLowerCase()
          return requiredTerms.every(r => nameLower.includes(r) || descLower.includes(r))
        })
      : deferred

    const scored = candidates.map(tool => {
      const nameLower = tool.name.toLowerCase()
      const descLower = tool.description.toLowerCase()
      const hintLower = (tool.searchHint || '').toLowerCase()
      const nameParts = nameLower.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').split(/\s+/)

      let score = 0
      for (const term of allTerms) {
        // Exact name part match
        if (nameParts.includes(term)) score += 10
        // Partial name match
        else if (nameLower.includes(term)) score += 5
        // Hint match
        if (hintLower.includes(term)) score += 4
        // Description match
        if (descLower.includes(term)) score += 2
        // Tag match
        if (tool.tags?.some(tag => tag.toLowerCase().includes(term))) score += 3
      }
      return { tool, score }
    })

    const matches = scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map(s => s.tool)

    return { matches, query, totalDeferred: deferred.length }
  }

  /**
   * Load tools by name — makes them available for the next API call.
   * Returns the loaded tool definitions.
   */
  load(names: string[]): ToolDef[] {
    const loaded: ToolDef[] = []
    for (const name of names) {
      const tool = this.allTools.get(name)
      if (tool && !this.loadedTools.has(name)) {
        this.loadedTools.add(name)
        loaded.push(tool)
        this.emit('tool:loaded', tool)
      }
    }
    return loaded
  }

  /** Record a tool usage (for warmup prediction) */
  recordUsage(name: string): void {
    this.usageCount.set(name, (this.usageCount.get(name) || 0) + 1)
  }

  // ── Warmup ───────────────────────────────────────────────────

  /**
   * Predict and pre-load tools based on workspace context.
   *
   * Strategy:
   * 1. Recent usage: tools used in last N sessions
   * 2. Workspace signals: file types → relevant tools
   * 3. First message hint: if provided, search and pre-load
   */
  async warmup(context: WarmupContext): Promise<string[]> {
    const toLoad = new Set<string>()

    // 1. Recent usage — top 5 most-used deferred tools
    const usageSorted = [...this.usageCount.entries()]
      .filter(([name]) => !this.loadedTools.has(name) && this.allTools.has(name))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
    for (const [name] of usageSorted) {
      toLoad.add(name)
    }

    // 2. Workspace signals
    if (context.fileExtensions) {
      const extToTags: Record<string, string[]> = {
        '.ts': ['code', 'typescript', 'node'],
        '.tsx': ['code', 'typescript', 'react'],
        '.js': ['code', 'javascript', 'node'],
        '.py': ['code', 'python'],
        '.swift': ['code', 'swift', 'ios'],
        '.vue': ['code', 'vue', 'frontend'],
        '.md': ['docs', 'markdown'],
        '.json': ['config'],
      }
      const relevantTags = new Set<string>()
      for (const ext of context.fileExtensions) {
        for (const tag of extToTags[ext] || []) {
          relevantTags.add(tag)
        }
      }
      // Find deferred tools matching these tags
      for (const tool of this.getDeferredTools()) {
        if (tool.tags?.some(tag => relevantTags.has(tag))) {
          toLoad.add(tool.name)
        }
      }
    }

    // 3. First message hint
    if (context.firstMessage) {
      const result = this.search(context.firstMessage, 3)
      for (const tool of result.matches) {
        toLoad.add(tool.name)
      }
    }

    // Load them
    const names = [...toLoad]
    const loaded = this.load(names)
    for (const t of loaded) {
      this.warmedUp.add(t.name)
    }

    return names
  }

  // ── Stats ────────────────────────────────────────────────────

  getStats() {
    return {
      total: this.allTools.size,
      core: this.getCoreTools().length,
      loaded: this.loadedTools.size,
      deferred: this.getDeferredTools().length,
      warmedUp: this.warmedUp.size,
      usageTop5: [...this.usageCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
    }
  }
}

// ── Warmup Context ─────────────────────────────────────────────

export interface WarmupContext {
  /** File extensions found in workspace root */
  fileExtensions?: string[]
  /** First user message (if available) */
  firstMessage?: string
  /** Previously used tool names from persistence */
  recentToolNames?: string[]
}

// ── tool_search tool definition ────────────────────────────────

export function createToolSearchToolDef(registry: ToolRegistry): ToolDef {
  return {
    name: 'tool_search',
    description: `Search and load additional tools. Deferred tools are listed by name only — use this to fetch their full schema before calling them.

Query forms:
- "select:tool1,tool2" — load specific tools by name
- "keyword search" — find tools by keyword (up to max_results)
- "+required keyword" — require 'required' in tool name

Currently ${registry.getDeferredTools().length} deferred tools available.`,
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query. Use "select:name" for exact match, or keywords to search.',
        },
        max_results: {
          type: 'number',
          description: 'Max results (default 5)',
        },
      },
      required: ['query'],
    },
    core: true,
    tags: ['meta'],
  }
}
