import { defineConfig } from '@playwright/test';

// Standalone config for the Share-dialog layout regression (the repo's default
// playwright.config.ts depends on an uninstalled helper package).
//
// `VITE_API_GATEWAY_URL` is pinned to the dev-server origin so the harness's
// Gateway calls are same-origin and can be fulfilled by `page.route`.
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.layout.spec.ts',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
  },
  webServer: {
    command: 'npx vite --port 5173 --strictPort',
    url: 'http://localhost:5173/e2e/share-harness.html',
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      VITE_API_GATEWAY_URL: 'http://localhost:5173',
    },
  },
});
