<template>
  <div class="memory-search">
    <div class="search-header">
      <input
        v-model="query"
        @input="onSearch"
        placeholder="Search memory..."
        class="search-input"
      />
      <button @click="onBuildIndex" :disabled="isIndexing" class="index-btn">
        {{ isIndexing ? 'Indexing...' : 'Rebuild Index' }}
      </button>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="isSearching" class="loading">Searching...</div>

    <div v-else-if="results.length > 0" class="results">
      <div v-for="result in results" :key="`${result.path}-${result.startLine}`" class="result-item">
        <div class="result-header">
          <span class="path">{{ result.path }}</span>
          <span class="location">L{{ result.startLine }}-{{ result.endLine }}</span>
          <span class="badge">{{ result.source }}</span>
        </div>
        <div class="snippet">{{ result.snippet }}</div>
      </div>
    </div>

    <div v-else-if="query" class="no-results">No results found</div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useMemorySearch } from '../composables/useMemorySearch'
import { useWorkspace } from '../composables/useWorkspace'

const { currentWorkspace } = useWorkspace()
const { isIndexing, isSearching, results, error, buildIndex, search } = useMemorySearch()

const query = ref('')
let searchTimeout: NodeJS.Timeout | null = null

function onSearch() {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    if (currentWorkspace.value) {
      search(currentWorkspace.value, query.value)
    }
  }, 300)
}

async function onBuildIndex() {
  if (currentWorkspace.value) {
    await buildIndex(currentWorkspace.value)
  }
}
</script>

<style scoped>
.memory-search {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
}

.search-header {
  display: flex;
  gap: 0.5rem;
}

.search-input {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.search-input:focus {
  outline: none;
  border-color: var(--accent-color);
}

.index-btn {
  padding: 0.5rem 1rem;
  background: var(--accent-color);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.index-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error {
  color: #ff6b6b;
  padding: 0.5rem;
  background: rgba(255, 107, 107, 0.1);
  border-radius: 4px;
}

.loading, .no-results {
  text-align: center;
  color: var(--text-secondary);
  padding: 2rem;
}

.results {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.result-item {
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
}

.result-header {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
}

.path {
  font-weight: 600;
  color: var(--accent-color);
}

.location {
  color: var(--text-secondary);
}

.badge {
  padding: 0.125rem 0.5rem;
  background: var(--bg-tertiary);
  border-radius: 3px;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.snippet {
  color: var(--text-primary);
  font-size: 0.875rem;
  white-space: pre-wrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
