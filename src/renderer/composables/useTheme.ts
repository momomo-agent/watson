import { ref, watch } from 'vue'

type Theme = 'light' | 'dark'

// Restore saved theme or default to light
const savedTheme = (typeof localStorage !== 'undefined'
  ? localStorage.getItem('watson-theme') as Theme | null
  : null) || 'light'

const theme = ref<Theme>(savedTheme)

// Apply immediately (before mount) to avoid flash
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-theme', theme.value)
}

export function useTheme() {
  const setTheme = (newTheme: Theme) => {
    theme.value = newTheme
    document.documentElement.setAttribute('data-theme', newTheme)
    localStorage.setItem('watson-theme', newTheme)
  }

  const toggleTheme = () => {
    setTheme(theme.value === 'light' ? 'dark' : 'light')
  }

  // Watch for external changes to theme ref (e.g. v-model on select)
  watch(theme, (newVal) => {
    document.documentElement.setAttribute('data-theme', newVal)
    localStorage.setItem('watson-theme', newVal)
  })

  return {
    theme,
    setTheme,
    toggleTheme
  }
}
