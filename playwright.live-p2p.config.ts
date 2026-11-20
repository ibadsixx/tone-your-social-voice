import { defineConfig } from '@playwright/test';

const VITE_PORT = 5174;
const MOCK_PORT = 8787;

export default defineConfig({
  testDir: './e2e',
  testMatch: 'live-p2p.spec.ts',
  timeout: 180_000,
  expect: { timeout: 90_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${VITE_PORT}`,
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--disable-features=WebRtcHideLocalIpsWithMdns',
        '--force-webrtc-ip-handling-policy=default_public_and_private_interfaces',
      ],
    },
  },
  webServer: [
    {
      command: 'node e2e/mock-signaling-server.mjs',
      url: `http://127.0.0.1:${MOCK_PORT}/api/live/signaling`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: `npx vite --port ${VITE_PORT} --strictPort`,
      url: `http://127.0.0.1:${VITE_PORT}/`,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        VITE_API_GATEWAY_URL: `http://127.0.0.1:${MOCK_PORT}`,
      },
    },
  ],
});
