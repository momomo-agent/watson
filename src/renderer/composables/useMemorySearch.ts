import { ref } from 'vue'
import { backend } from '../infrastructure/backend'

interface SearchResult {
  path: string
  startLine: number
  endLine: number
  score: number
  snippet: string
  source: 'fts' | 'vector' | 'hybrid'
}

export function useMemorySearch() {
  const isIndexing = ref(false)
  const isSearching = ref(false)
  const results = ref<SearchResult[]>([])
  const error = ref<string | null>(null)

  async function buildIndex(workspaceDir: string) {
    isIndexing.value = true
    error.value = null
    try {
      const result = await backend.invoke('memory:buildIndex', { workspaceDir })
      if (!result.success) throw new Error(result.error)
      return result.count
    } catch (e) {
      error.value = (e as Error).message
      throw e
    } finally {
      isIndexing.value = false
    }
  }

  async function search(workspaceDir: string, query: string, maxResults = 10) {
    if (!query.trim()) { results.value = []; return }
    isSearching.value = true
    error.value = null
    try {
      const result = await backend.invoke('memory:search', { workspaceDir, query, maxResults })
      if (!result.success) throw new Error(result.error)
      results.value = result.results
      return result.results
    } catch (e) {
      error.value = (e as Error).message
      results.value = []
      throw e
    } finally {
      isSearching.value = false
    }
  }

  return { isIndexing, isSearching, results, error, buildIndex, search }
}
