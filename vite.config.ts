import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.js'],
  },
  server: {
    port: 5173,
    watch: {
      // Kept as a guard: a database file written inside the project root makes
      // Vite treat every save as a source change and issue a full page reload,
      // which closes open dialogs mid-edit. The database is remote now, but this
      // stops the problem returning if a local one is ever added back.
      ignored: ['**/data/**', '**/*.db', '**/*.db-wal', '**/*.db-shm'],
    },
    proxy: {
      // Everything under /api goes to the local Express server, which in turn
      // proxies UQ (the UQ API sends no CORS headers, so the browser can't call it).
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
