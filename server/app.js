import express from 'express'
import cookieParser from 'cookie-parser'
import { randomBytes } from 'node:crypto'
import { all, one, run, ensureSchema } from './db.js'
import { searchSubjects } from './uq.js'
import {
  attachUser,
  createSession,
  destroySession,
  hashPassword,
  requireAuth,
  setSessionCookie,
  verifyLogin,
  SESSION_COOKIE,
} from './auth.js'

export const app = express()

app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const CATEGORIES = ['work', 'social', 'sport', 'study', 'travel', 'personal', 'other']

/** Wraps an async handler so rejections reach the error middleware. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

function bad(message) {
  return Object.assign(new Error(message), { status: 400 })
}

function notFound(message = 'Timetable not found') {
  return Object.assign(new Error(message), { status: 404 })
}

// The schema is created on first use, so a fresh database needs no manual step.
app.use(wrap(async (_req, _res, next) => {
  await ensureSchema()
  next()
}))
app.use(wrap(attachUser))

/* ------------------------------------------------------------------ auth -- */

app.post(
  '/api/auth/register',
  wrap(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const displayName = String(req.body?.displayName || '').trim()
    const password = String(req.body?.password || '')

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('Enter a valid email address')
    if (displayName.length < 1) throw bad('Enter a display name')
    if (password.length < 8) throw bad('Password must be at least 8 characters')

    const exists = await one('SELECT 1 FROM users WHERE email = $1', [email])
    if (exists) throw bad('An account with that email already exists')

    const user = await one(
      'INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id',
      [email, displayName, hashPassword(password)],
    )

    // Give every new account a timetable so the app is never empty on arrival.
    await run('INSERT INTO timetables (user_id, name) VALUES ($1, $2)', [user.id, 'My timetable'])

    setSessionCookie(res, await createSession(user.id))
    res.status(201).json({ user: { id: user.id, email, displayName } })
  }),
)

app.post(
  '/api/auth/login',
  wrap(async (req, res) => {
    const user = await verifyLogin(req.body?.email, req.body?.password)
    if (!user) throw Object.assign(new Error('Incorrect email or password'), { status: 401 })
    setSessionCookie(res, await createSession(user.id))
    res.json({ user })
  }),
)

app.post(
  '/api/auth/logout',
  wrap(async (req, res) => {
    await destroySession(req.cookies?.[SESSION_COOKIE])
    res.clearCookie(SESSION_COOKIE)
    res.json({ ok: true })
  }),
)

app.get('/api/auth/me', (req, res) => res.json({ user: req.user || null }))

/* -------------------------------------------------------------- UQ search -- */

app.get(
  '/api/uq/search',
  wrap(async (req, res) => {
    const q = String(req.query.q || '').trim()
    if (q.length < 2) return res.json({ courses: [] })
    const courses = await searchSubjects(q, {
      semester: req.query.semester || 'ALL',
      campus: req.query.campus || 'ALL',
    })
    res.json({ courses })
  }),
)

/* ------------------------------------------------------------- timetables -- */

async function loadTimetable(id) {
  const tt = await one(
    `SELECT id, user_id AS "userId", name, share_token AS "shareToken",
            is_shared AS "isShared", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM timetables WHERE id = $1`,
    [id],
  )
  if (!tt) return null

  tt.classes = await all(
    `SELECT id, subject_code AS "subjectCode", callista_code AS "callistaCode",
            description, semester, campus,
            activity_group_code AS "activityGroupCode", activity_code AS "activityCode",
            activity_type AS "activityType", day_of_week AS "dayOfWeek",
            start_time AS "startTime", duration_mins AS "durationMins",
            location, staff, color, dates
       FROM uq_classes WHERE timetable_id = $1
      ORDER BY callista_code, activity_group_code`,
    [id],
  )

  tt.events = await all(
    `SELECT id, title, category, recurrence, day_of_week AS "dayOfWeek",
            event_date AS "eventDate", start_time AS "startTime",
            duration_mins AS "durationMins", location, notes, color
       FROM custom_events WHERE timetable_id = $1 ORDER BY start_time`,
    [id],
  )

  return tt
}

/** Loads a timetable and 404s unless the signed-in user owns it. */
async function ownedOr404(req) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) throw notFound()
  const tt = await loadTimetable(id)
  if (!tt || tt.userId !== req.user.id) throw notFound()
  return tt
}

async function touch(id) {
  await run('UPDATE timetables SET updated_at = now() WHERE id = $1', [id])
}

app.get(
  '/api/timetables',
  requireAuth,
  wrap(async (req, res) => {
    // Only id and name are actually used (the switcher dropdown), so this
    // stays a plain select rather than aggregating child rows on every call.
    const timetables = await all(
      `SELECT id, name, share_token AS "shareToken", is_shared AS "isShared",
              updated_at AS "updatedAt"
         FROM timetables WHERE user_id = $1 ORDER BY updated_at DESC`,
      [req.user.id],
    )
    res.json({ timetables })
  }),
)

app.post(
  '/api/timetables',
  requireAuth,
  wrap(async (req, res) => {
    const name = String(req.body?.name || '').trim() || 'Untitled timetable'
    const row = await one(
      'INSERT INTO timetables (user_id, name) VALUES ($1, $2) RETURNING id',
      [req.user.id, name],
    )
    res.status(201).json({ timetable: await loadTimetable(row.id) })
  }),
)

app.get('/api/timetables/:id', requireAuth, wrap(async (req, res) => {
  res.json({ timetable: await ownedOr404(req) })
}))

app.patch('/api/timetables/:id', requireAuth, wrap(async (req, res) => {
  const tt = await ownedOr404(req)

  if (typeof req.body?.name === 'string') {
    const name = req.body.name.trim()
    if (!name) throw bad('Name cannot be empty')
    await run('UPDATE timetables SET name = $1 WHERE id = $2', [name, tt.id])
  }

  if (typeof req.body?.isShared === 'boolean') {
    if (req.body.isShared) {
      // Reuse the existing token so an already-circulated link keeps working.
      const token = tt.shareToken || randomBytes(9).toString('base64url')
      await run('UPDATE timetables SET is_shared = true, share_token = $1 WHERE id = $2', [
        token,
        tt.id,
      ])
    } else {
      await run('UPDATE timetables SET is_shared = false WHERE id = $1', [tt.id])
    }
  }

  await touch(tt.id)
  res.json({ timetable: await loadTimetable(tt.id) })
}))

app.delete('/api/timetables/:id', requireAuth, wrap(async (req, res) => {
  const tt = await ownedOr404(req)
  await run('DELETE FROM timetables WHERE id = $1', [tt.id])
  res.json({ ok: true })
}))

/* ---------------------------------------------------------- picked classes -- */

app.post('/api/timetables/:id/classes', requireAuth, wrap(async (req, res) => {
  const tt = await ownedOr404(req)
  const c = req.body || {}
  if (!c.subjectCode || !c.activityGroupCode || !c.activityCode) {
    throw bad('Missing class identifiers')
  }

  // One option per activity group: picking TUT02 replaces TUT01.
  await run(
    'DELETE FROM uq_classes WHERE timetable_id = $1 AND subject_code = $2 AND activity_group_code = $3',
    [tt.id, String(c.subjectCode), String(c.activityGroupCode)],
  )

  await run(
    `INSERT INTO uq_classes
       (timetable_id, subject_code, callista_code, description, semester, campus,
        activity_group_code, activity_code, activity_type, day_of_week, start_time,
        duration_mins, location, staff, color, dates)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)`,
    [
      tt.id,
      String(c.subjectCode),
      String(c.callistaCode || ''),
      String(c.description || ''),
      c.semester ?? null,
      c.campus ?? null,
      String(c.activityGroupCode),
      String(c.activityCode),
      c.activityType ?? null,
      DAYS.includes(c.dayOfWeek) ? c.dayOfWeek : null,
      c.startTime ?? null,
      Number.parseInt(c.durationMins, 10) || 0,
      c.location ?? null,
      c.staff ?? null,
      c.color ?? null,
      JSON.stringify(Array.isArray(c.dates) ? c.dates : []),
    ],
  )

  await touch(tt.id)
  res.status(201).json({ timetable: await loadTimetable(tt.id) })
}))

app.delete('/api/timetables/:id/classes/:classId', requireAuth, wrap(async (req, res) => {
  const tt = await ownedOr404(req)
  await run('DELETE FROM uq_classes WHERE id = $1 AND timetable_id = $2', [
    Number(req.params.classId),
    tt.id,
  ])
  await touch(tt.id)
  res.json({ timetable: await loadTimetable(tt.id) })
}))

/** Removes a whole course (all of its activity groups) at once. */
app.delete('/api/timetables/:id/courses/:subjectCode', requireAuth, wrap(async (req, res) => {
  const tt = await ownedOr404(req)
  await run('DELETE FROM uq_classes WHERE timetable_id = $1 AND subject_code = $2', [
    tt.id,
    req.params.subjectCode,
  ])
  await touch(tt.id)
  res.json({ timetable: await loadTimetable(tt.id) })
}))

/* ---------------------------------------------------------- custom events -- */

function readEvent(body) {
  const title = String(body?.title || '').trim()
  if (!title) throw bad('Give the event a title')

  const recurrence = body?.recurrence === 'once' ? 'once' : 'weekly'
  const startTime = String(body?.startTime || '')
  if (!/^\d{2}:\d{2}$/.test(startTime)) throw bad('Start time must look like 09:30')

  const durationMins = Number.parseInt(body?.durationMins, 10)
  if (!Number.isFinite(durationMins) || durationMins < 5 || durationMins > 1440) {
    throw bad('Duration must be between 5 and 1440 minutes')
  }

  let dayOfWeek = null
  let eventDate = null
  if (recurrence === 'weekly') {
    if (!DAYS.includes(body?.dayOfWeek)) throw bad('Pick a day of the week')
    dayOfWeek = body.dayOfWeek
  } else {
    eventDate = String(body?.eventDate || '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) throw bad('Pick a date')
  }

  return {
    title,
    category: CATEGORIES.includes(body?.category) ? body.category : 'other',
    recurrence,
    dayOfWeek,
    eventDate,
    startTime,
    durationMins,
    location: body?.location ? String(body.location) : null,
    notes: body?.notes ? String(body.notes) : null,
    color: body?.color ? String(body.color) : null,
  }
}

app.post('/api/timetables/:id/events', requireAuth, wrap(async (req, res) => {
  const tt = await ownedOr404(req)
  const e = readEvent(req.body)
  await run(
    `INSERT INTO custom_events
       (timetable_id, title, category, recurrence, day_of_week, event_date,
        start_time, duration_mins, location, notes, color)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [tt.id, e.title, e.category, e.recurrence, e.dayOfWeek, e.eventDate,
     e.startTime, e.durationMins, e.location, e.notes, e.color],
  )
  await touch(tt.id)
  res.status(201).json({ timetable: await loadTimetable(tt.id) })
}))

app.patch('/api/timetables/:id/events/:eventId', requireAuth, wrap(async (req, res) => {
  const tt = await ownedOr404(req)
  const existing = await one('SELECT 1 FROM custom_events WHERE id = $1 AND timetable_id = $2', [
    Number(req.params.eventId),
    tt.id,
  ])
  if (!existing) throw notFound('Event not found')

  const e = readEvent(req.body)
  await run(
    `UPDATE custom_events
        SET title=$1, category=$2, recurrence=$3, day_of_week=$4, event_date=$5,
            start_time=$6, duration_mins=$7, location=$8, notes=$9, color=$10
      WHERE id=$11 AND timetable_id=$12`,
    [e.title, e.category, e.recurrence, e.dayOfWeek, e.eventDate,
     e.startTime, e.durationMins, e.location, e.notes, e.color,
     Number(req.params.eventId), tt.id],
  )
  await touch(tt.id)
  res.json({ timetable: await loadTimetable(tt.id) })
}))

app.delete('/api/timetables/:id/events/:eventId', requireAuth, wrap(async (req, res) => {
  const tt = await ownedOr404(req)
  await run('DELETE FROM custom_events WHERE id = $1 AND timetable_id = $2', [
    Number(req.params.eventId),
    tt.id,
  ])
  await touch(tt.id)
  res.json({ timetable: await loadTimetable(tt.id) })
}))

/* ----------------------------------------------------------------- share -- */

/** Public, read-only view. No session required, and never exposes the owner's email. */
app.get('/api/share/:token', wrap(async (req, res) => {
  const row = await one(
    'SELECT id FROM timetables WHERE share_token = $1 AND is_shared = true',
    [req.params.token],
  )
  if (!row) throw notFound('This timetable is not shared')

  const tt = await loadTimetable(row.id)
  const owner = await one('SELECT display_name AS name FROM users WHERE id = $1', [tt.userId])

  res.json({
    timetable: {
      name: tt.name,
      ownerName: owner?.name || 'Someone',
      classes: tt.classes,
      events: tt.events,
    },
  })
}))

/* ------------------------------------------------------------------ misc -- */

app.use((err, _req, res, _next) => {
  const status = err.status || 500
  if (status >= 500) console.error(err)
  res.status(status).json({ error: err.message || 'Something went wrong' })
})

export default app
