import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const serverURL = 'http://127.0.0.1:5176'
const baseURL = `${serverURL}/`

function createProject(name: string, deviceName: keyof typeof devices, projectBaseURL: string) {
  return {
    name,
    use: {
      ...devices[deviceName],
      baseURL: projectBaseURL,
    },
  }
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    createProject('minimal', 'Desktop Chrome', baseURL),
    createProject('full', 'Desktop Chrome', `${baseURL}full-editor/`),
    createProject('minimal-webkit', 'Desktop Safari', baseURL),
    createProject('full-webkit', 'Desktop Safari', `${baseURL}full-editor/`),
  ],
  webServer: {
    command: 'pnpm exec vite --config tests/vite.config.ts --host 127.0.0.1',
    cwd: __dirname,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: serverURL,
  },
})
