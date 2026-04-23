import { defineConfig } from 'vite';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

function copyDirectoryRecursive(sourceDir: string, targetDir: string): void {
  if (!existsSync(sourceDir)) {
    return;
  }

  mkdirSync(targetDir, { recursive: true });
  for (const entryName of readdirSync(sourceDir)) {
    const sourcePath = join(sourceDir, entryName);
    const targetPath = join(targetDir, entryName);
    const entryStat = statSync(sourcePath);

    if (entryStat.isDirectory()) {
      copyDirectoryRecursive(sourcePath, targetPath);
      continue;
    }

    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(sourcePath, targetPath);
  }
}

function preparePdfJsAssets(): void {
  const projectRoot = dirname(fileURLToPath(import.meta.url));
  const pdfjsRoot = join(projectRoot, 'node_modules', 'pdfjs-dist');
  const publicPdfjsRoot = join(projectRoot, 'public', 'pdfjs');

  copyDirectoryRecursive(join(pdfjsRoot, 'cmaps'), join(publicPdfjsRoot, 'cmaps'));
  copyDirectoryRecursive(
    join(pdfjsRoot, 'standard_fonts'),
    join(publicPdfjsRoot, 'standard_fonts')
  );
}

preparePdfJsAssets();

// 配置 Vite 构建与开发能力。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
