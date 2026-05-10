import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@functionspace/core': path.resolve(__dirname, '../packages/core/src'),
      '@functionspace/react': path.resolve(__dirname, '../packages/react/src'),
      '@functionspace/ui': path.resolve(__dirname, '../packages/ui/src'),
    },
  },
  server: {
    // Competition setup guide requires port 3000. Hard-pinned to fail loudly
    // (instead of silently falling back to another port) if 3000 is occupied.
    port: 3000,
    strictPort: true,
  },
  preview: {
    port: 3000,
    strictPort: true,
  },
});
