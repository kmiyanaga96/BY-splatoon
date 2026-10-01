import { defineConfig } from 'vitest/config';

// Firestore ルールのテスト専用 (エミュレーターが必要)
export default defineConfig({
  test: { include: ['tests/**/*.rules.test.ts'], testTimeout: 20000, hookTimeout: 30000, fileParallelism: false },
});
