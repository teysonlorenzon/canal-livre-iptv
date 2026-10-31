import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = 8771;
const TV_PORT = 8772;
const isCi = !!process.env.CI;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  reporter: isCi ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}/`,
    contextOptions: { reducedMotion: 'reduce' },
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `npm run web:build && npx esbuild --serve=127.0.0.1:${WEB_PORT} --servedir=dist`,
      url: `http://127.0.0.1:${WEB_PORT}/`,
      reuseExistingServer: !isCi,
    },
    {
      command: `npm run tv:build && npx esbuild --serve=127.0.0.1:${TV_PORT} --servedir=apps/tv-webos/dist`,
      url: `http://127.0.0.1:${TV_PORT}/`,
      reuseExistingServer: !isCi,
    },
  ],
  projects: [
    { name: 'web', testIgnore: /(tv|celular)\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'celular', testMatch: /celular\.spec\.ts/, use: { ...devices['Pixel 7'] } },
    { name: 'tv', testMatch: /tv\.spec\.ts/, use: { baseURL: `http://127.0.0.1:${TV_PORT}/`, viewport: { width: 1280, height: 720 } } },
  ],
});
