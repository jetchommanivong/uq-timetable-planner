/**
 * Vercel entrypoint for the API.
 *
 * The catch-all filename means every /api/* request lands here with its
 * original URL intact, so the Express app's own /api/... routes still match.
 * Exporting the app directly works because an Express app is just an
 * (req, res) handler, which is what Vercel's Node runtime expects.
 */
import app from '../server/app.js'

export default app
