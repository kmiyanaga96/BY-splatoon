import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' にしておくと GitHub Pages のサブパスやローカルファイルでも動く
export default defineConfig({
  base: './',
  plugins: [react()],
});
