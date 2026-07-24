import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'monaco-editor/esm/vs/editor/editor.api.js': fileURLToPath(
        new URL('./node_modules/monaco-editor/esm/vs/editor/editor.api.js', import.meta.url)
      ),
      'monaco-editor': fileURLToPath(
        new URL('./node_modules/monaco-editor', import.meta.url)
      ),
    },
  },
  optimizeDeps: {
    include: ['y-monaco', 'monaco-editor'],
  },
});