import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// 只跑純函式單元測試，不連 Supabase
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
