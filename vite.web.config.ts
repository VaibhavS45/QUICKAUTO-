/**
 * Browser preview config for `npm run web`.
 *
 * Same renderer bundle as Electron, served by plain Vite: no main process, no
 * preload. `src/renderer/browser-preview.ts` stubs `window.app` at startup.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': resolve(__dirname, 'src/renderer') } }
})