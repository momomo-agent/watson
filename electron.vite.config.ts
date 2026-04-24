import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// Rollup plugin to inject __dirname/__filename polyfill for ESM bundles
// that contain CJS libraries using these globals
function dirnamePolyfillPlugin() {
  return {
    name: 'dirname-polyfill',
    renderChunk(code: string) {
      if (code.includes('import.meta.url')) {
        // Already has import.meta references, just ensure __dirname exists
        const banner = `
import { fileURLToPath as __polyfill_fileURLToPath } from 'url';
import { dirname as __polyfill_dirname } from 'path';
const __filename = __polyfill_fileURLToPath(import.meta.url);
const __dirname = __polyfill_dirname(__filename);
`
        return banner + code
      }
      return null
    }
  }
}

export default defineConfig(({ mode }) => ({
  main: {
    build: {
      outDir: 'dist-electron/main',
      rollupOptions: {
        input: resolve('src/main/index.ts'),
        external: ['electron', 'better-sqlite3'],
        plugins: [dirnamePolyfillPlugin()],
      },
    },
    define: mode === 'development' ? {
      // Let electron-vite inject the actual dev server URL at runtime
      // (hardcoding port breaks when 5173 is occupied)
    } : {},
  },
  preload: {
    build: {
      outDir: 'dist-electron/preload',
      rollupOptions: {
        external: ['electron'],
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer')
      }
    },
    plugins: [vue()],
    build: {
      outDir: 'dist-electron/renderer'
    }
  }
}))
