import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: 'http://localhost:4173/baduk-notebook/', trace: 'off' },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/baduk-notebook/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } }, testIgnore: /phone/ },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /phone/ },
  ],
})
