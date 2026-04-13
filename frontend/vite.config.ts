import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 配置 Vite 构建与开发能力。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173
  }
});
