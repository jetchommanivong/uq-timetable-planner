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
        configure: (proxy) => {
          // When the API server is down or restarting, Vite's default is a bare
          // 500 with no body — indistinguishable from an application bug. Send
          // a real message instead so the app's error banner explains it.
          proxy.on('error', (_err, _req, res) => {
            if (res && 'writeHead' in res && !res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' })
              res.end(
                JSON.stringify({
                  error:
                    "The API server isn't responding. It may still be starting, or port 3001 is held by an old process — check the terminal running `npm run dev`.",
                }),
              )
            }
          })
        },
      },
    },
  },
})
