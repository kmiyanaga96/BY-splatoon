/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' にしておくと GitHub Pages のサブパスやローカルファイルでも動く
export default defineConfig({
  base: './',
  plugins: [react()],
  // Firebase の SDK (約 600KB) は起動後に遅延読み込みしているので、警告の基準を上げておく
  build: { chunkSizeWarningLimit: 700 },
  // tests/ は Firestore エミュレーターが必要なルールのテスト (npm run test:rules で実行)
  test: { exclude: ['tests/**', 'node_modules/**'] },
});
