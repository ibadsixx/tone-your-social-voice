import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
    env: {
      VITE_INFRA_SUPABASE_URL: 'https://infra.supabase.co',
      VITE_INFRA_SUPABASE_ANON_KEY: 'test-anon-key',
    },
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
