/**
 * Vercel entrypoint for the API.
 *
 * Vercel exposes this file at /api. The `/api/(.*)` rewrite in vercel.json
 * sends every API request here while preserving the original URL, so the
 * Express app's own /api/... routes still match.
 *
 * Note: a `[...path].js` catch-all does NOT work here — that is a Next.js
 * convention. Vercel's plain /api directory ignores it and every route 404s.
 * Keep this file named index.js.
 *
 * Exporting the app directly works because an Express app is just an
 * (req, res) handler, which is what Vercel's Node runtime expects.
 */
import app from '../server/app.js'

export default app
