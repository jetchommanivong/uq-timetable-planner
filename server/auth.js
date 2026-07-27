import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { one, run, daysFromNow } from './db.js'

const SESSION_DAYS = 30
export const SESSION_COOKIE = 'uqtt_session'

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10)
}

export async function createSession(userId) {
  const token = randomBytes(32).toString('hex')
  await run('INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)', [
    token,
    userId,
    daysFromNow(SESSION_DAYS),
  ])
  return token
}

export async function destroySession(token) {
  if (token) await run('DELETE FROM sessions WHERE token = $1', [token])
}

export async function userForToken(token) {
  if (!token) return null
  // Expiry is enforced in SQL so a stale row can never authenticate.
  return one(
    `SELECT u.id, u.email, u.display_name AS "displayName"
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = $1 AND s.expires_at > now()`,
    [token],
  )
}

export async function verifyLogin(email, password) {
  const row = await one(
    'SELECT id, email, display_name AS "displayName", password_hash AS "passwordHash" FROM users WHERE email = $1',
    [String(email || '').trim().toLowerCase()],
  )
  // Always run a compare so a missing account and a wrong password take a
  // similar amount of time.
  const hash = row?.passwordHash || '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu'
  const ok = bcrypt.compareSync(String(password || ''), hash)
  if (!row || !ok) return null
  return { id: row.id, email: row.email, displayName: row.displayName }
}

/** Populates req.user when a valid session cookie is present. Never rejects. */
export async function attachUser(req, _res, next) {
  try {
    req.user = await userForToken(req.cookies?.[SESSION_COOKIE])
  } catch (err) {
    return next(err)
  }
  next()
}

/** Gate for routes that require a signed-in user. */
export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' })
  next()
}

export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_DAYS * 86_400_000,
    // Vercel serves over TLS; local development is plain http.
    secure: process.env.NODE_ENV === 'production',
  })
}
