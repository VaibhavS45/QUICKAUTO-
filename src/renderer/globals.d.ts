import type { AppApi } from '../preload/index.js'

declare global {
  interface Window {
    app: AppApi
  }
}

export {}
