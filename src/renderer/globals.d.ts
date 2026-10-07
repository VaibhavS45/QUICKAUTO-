import type { PaletteApi } from '../preload/index.js'

declare global {
  interface Window {
    palette: PaletteApi
  }
}

export {}
