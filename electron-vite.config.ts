import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    // NOTE: the real preload bundle is built by scripts/build-preload.mjs
    // (CJS, required for sandboxed renderers). This entry only satisfies
    // electron-vite's expected project shape; its ESM output is unused.
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload-unused'
    }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react(), tailwindcss()],
    build: {
      outDir: '../../out/renderer'
    }
  }
})
