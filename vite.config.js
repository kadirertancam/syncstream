import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Backend URL - Docker uses service name, local uses localhost
const BACKEND_URL = process.env.VITE_BACKEND_URL || 'http://localhost:4001';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@stores': path.resolve(__dirname, './src/stores'),
    },
  },

  server: {
    port: parseInt(process.env.PORT || '4080'),
    host: true,
    proxy: {
      '/api': {
        target: BACKEND_URL,
        changeOrigin: true,
      },
      '/socket.io': {
        target: BACKEND_URL,
        changeOrigin: true,
        ws: true,
      },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          socket: ['socket.io-client'],
        },
      },
    },
  },

  optimizeDeps: {
    include: ['react', 'react-dom', 'socket.io-client'],
  },
});
