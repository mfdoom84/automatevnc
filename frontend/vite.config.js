import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Get configuration from environment variables with defaults
const FRONTEND_PORT = parseInt(process.env.FRONTEND_PORT) || 3000
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080'

export default defineConfig({
  plugins: [
    react({
      jsxRuntime: 'automatic',
      jsxImportSource: 'react'
    })
  ],
  server: {
    port: FRONTEND_PORT,
    proxy: {
      '/api': {
        target: BACKEND_URL,
        changeOrigin: true,
        ws: true
      },
      '/docs': {
        target: BACKEND_URL,
        changeOrigin: true
      },
      '/openapi.json': {
        target: BACKEND_URL,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'esnext'
  },
  esbuild: {
    jsx: 'automatic'
  }
})
