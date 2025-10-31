import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.FEATHER_BASE_URL ?? 'http://146.190.100.142';

export default defineConfig({
  testDir: './tests',
  timeout: 120 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  reporter: [['list'], ['html', { outputFolder: 'PLAYWRIGHT/playwright-report', open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
