import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { resolve } from 'node:path';
export default defineConfig({
  root: 'production',
  publicDir: resolve('public'),
  resolve: { alias: { '@': resolve('.') } },
  plugins: [react()],
  css: { postcss: { plugins: [tailwindcss()] } },
  build: { outDir: resolve('server/web'), emptyOutDir: true },
});
