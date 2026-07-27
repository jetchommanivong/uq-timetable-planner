/**
 * Local development server.
 *
 * On Vercel the Express app is mounted by api/[...path].js instead — nothing
 * listens on a port there, so this file is only used when running locally.
 */
import app from './app.js'

const PORT = process.env.PORT || 3001

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`)
})
