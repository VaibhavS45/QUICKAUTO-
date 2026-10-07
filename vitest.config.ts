import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Playwright specs live under tests/e2e and run via `npm run test:e2e`,
    // never under vitest.
    exclude: ['tests/e2e/**', 'node_modules/**', 'out/**']
  }
})
