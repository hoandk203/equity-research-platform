import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

/**
 * End-to-end tests of the demo flow against the real API and Oracle database.
 * The API only allows the http://localhost:3000 origin (CORS), so the browser uses that host.
 * Both servers are started if not already running (reuseExistingServer).
 */
const baseURL = process.env['BASE_URL'] || 'http://localhost:3000';

export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './src' }),
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  use: {
    baseURL,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    viewport: { width: 1360, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npx nx run api:serve',
      url: 'http://localhost:4000/api/health',
      reuseExistingServer: true,
      cwd: workspaceRoot,
      timeout: 240000,
    },
    {
      command: 'npx nx run web:start',
      url: baseURL,
      reuseExistingServer: true,
      cwd: workspaceRoot,
      timeout: 240000,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 } } }],
});
