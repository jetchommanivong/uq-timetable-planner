/**
 * Local development server.
 *
 * On Vercel the Express app is mounted by api/index.js instead — nothing
 * listens on a port there, so this file is only used when running locally.
 */
import app from './app.js'

const PORT = process.env.PORT || 3001

const server = app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`)
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // Without this the process dies on an unhandled 'error' event and dumps a
    // stack trace. Worse, the Vite proxy then has nothing to talk to and the
    // browser just shows a bare 500, which looks like an app bug rather than
    // a leftover process.
    console.error(
      `\nPort ${PORT} is already in use — usually a previous \`npm run dev\` that didn't shut down.\n\n` +
        `  Windows:  npx kill-port ${PORT}\n` +
        `            (or) Get-NetTCPConnection -LocalPort ${PORT} -State Listen | ` +
        `ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }\n` +
        `  macOS/Linux:  lsof -ti:${PORT} | xargs kill -9\n\n` +
        `Then start it again. To use a different port instead: PORT=3002 npm run dev\n`,
    )
    process.exit(1)
  }
  throw err
})
