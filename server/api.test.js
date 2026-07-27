// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * Exercises the real Express app against an in-memory Postgres.
 *
 * The SQLite-to-Postgres migration rewrote every statement in the app, so this
 * runs them for real rather than trusting that they were translated correctly.
 * pg-mem is not a perfect Postgres, but it catches what actually goes wrong in
 * a port like this: placeholder numbering, unquoted camelCase aliases, boolean
 * and jsonb handling, and RETURNING clauses.
 */

process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test'

vi.mock('pg', async () => {
  const { newDb } = await import('pg-mem')
  const adapter = newDb().adapters.createPg()
  return { default: adapter, ...adapter }
})

// UQ search is covered elsewhere; keep this test off the network.
vi.mock('../server/uq.js', () => ({ searchSubjects: async () => [] }))

let base
let server

beforeAll(async () => {
  const { default: app } = await import('./app.js')
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})

afterAll(() => server?.close())

/** Tiny client that remembers the session cookie between calls. */
function client() {
  let cookie = ''
  return async (method, path, body) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) cookie = setCookie.split(';')[0]
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : {} }
  }
}

describe('API on Postgres', () => {
  const alice = client()
  let timetableId
  let shareToken

  it('registers a user and creates their first timetable', async () => {
    const res = await alice('POST', '/api/auth/register', {
      email: 'Alice@Student.UQ.edu.au',
      displayName: 'Alice',
      password: 'password123',
    })
    expect(res.status).toBe(201)
    // Email is normalised to lowercase on the way in.
    expect(res.body.user.email).toBe('alice@student.uq.edu.au')

    const list = await alice('GET', '/api/timetables')
    expect(list.status).toBe(200)
    expect(list.body.timetables).toHaveLength(1)
    timetableId = list.body.timetables[0].id
    // Booleans come back as real booleans, not 0/1 as they did under SQLite.
    expect(list.body.timetables[0].isShared).toBe(false)
  })

  it('keeps the session cookie working', async () => {
    const me = await alice('GET', '/api/auth/me')
    expect(me.body.user.displayName).toBe('Alice')
  })

  it('rejects a duplicate email and a bad password', async () => {
    const dupe = await alice('POST', '/api/auth/register', {
      email: 'alice@student.uq.edu.au',
      displayName: 'Alice',
      password: 'password123',
    })
    expect(dupe.status).toBe(400)

    const wrong = await client()('POST', '/api/auth/login', {
      email: 'alice@student.uq.edu.au',
      password: 'wrongpassword',
    })
    expect(wrong.status).toBe(401)
  })

  it('adds a class, round-tripping the jsonb dates array', async () => {
    const res = await alice('POST', `/api/timetables/${timetableId}/classes`, {
      subjectCode: 'DECO3500_S2',
      callistaCode: 'DECO3500',
      description: 'Social and Mobile Computing',
      semester: 'S2',
      campus: 'STLUCIA',
      activityGroupCode: 'STU01',
      activityCode: '01',
      activityType: 'Studio',
      dayOfWeek: 'Tue',
      startTime: '11:00',
      durationMins: 180,
      location: 'Advanced Engineering',
      staff: '',
      color: null,
      dates: ['2026-07-28', '2026-08-04'],
    })
    expect(res.status).toBe(201)

    const [cls] = res.body.timetable.classes
    expect(cls.dates).toEqual(['2026-07-28', '2026-08-04'])
    expect(cls.durationMins).toBe(180)
  })

  it('keeps separate activity groups but replaces within one', async () => {
    // A second group is additive — the DECO3500 two-studio case.
    await alice('POST', `/api/timetables/${timetableId}/classes`, {
      subjectCode: 'DECO3500_S2', callistaCode: 'DECO3500', description: 'S',
      activityGroupCode: 'STU02', activityCode: '01', activityType: 'Studio',
      dayOfWeek: 'Thu', startTime: '14:00', durationMins: 120, dates: [],
    })
    let tt = await alice('GET', `/api/timetables/${timetableId}`)
    expect(tt.body.timetable.classes).toHaveLength(2)

    // Re-picking inside a group swaps rather than duplicates.
    const res = await alice('POST', `/api/timetables/${timetableId}/classes`, {
      subjectCode: 'DECO3500_S2', callistaCode: 'DECO3500', description: 'S',
      activityGroupCode: 'STU02', activityCode: '02', activityType: 'Studio',
      dayOfWeek: 'Fri', startTime: '09:00', durationMins: 120, dates: [],
    })
    expect(res.body.timetable.classes).toHaveLength(2)
    expect(res.body.timetable.classes.map((c) => c.activityCode).sort()).toEqual(['01', '02'])
  })

  it('creates, edits and deletes a custom event', async () => {
    const created = await alice('POST', `/api/timetables/${timetableId}/events`, {
      title: 'Work at Coles', category: 'work', recurrence: 'weekly',
      dayOfWeek: 'Mon', startTime: '17:00', durationMins: 300, location: 'Toowong',
    })
    expect(created.status).toBe(201)
    const eventId = created.body.timetable.events[0].id

    const edited = await alice('PATCH', `/api/timetables/${timetableId}/events/${eventId}`, {
      title: 'Work at Woolies', category: 'work', recurrence: 'weekly',
      dayOfWeek: 'Tue', startTime: '18:00', durationMins: 240,
    })
    expect(edited.body.timetable.events[0].title).toBe('Work at Woolies')

    const removed = await alice('DELETE', `/api/timetables/${timetableId}/events/${eventId}`)
    expect(removed.body.timetable.events).toHaveLength(0)
  })

  it('validates event input', async () => {
    const res = await alice('POST', `/api/timetables/${timetableId}/events`, {
      title: '', startTime: '99:99', durationMins: 0,
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/title/i)
  })

  it('shares a timetable publicly without leaking the owner email', async () => {
    const shared = await alice('PATCH', `/api/timetables/${timetableId}`, { isShared: true })
    expect(shared.body.timetable.isShared).toBe(true)
    shareToken = shared.body.timetable.shareToken
    expect(shareToken).toBeTruthy()

    // Anonymous read — no cookie at all.
    const anon = await fetch(`${base}/api/share/${shareToken}`)
    const payload = await anon.json()
    expect(anon.status).toBe(200)
    expect(payload.timetable.ownerName).toBe('Alice')
    expect(JSON.stringify(payload)).not.toContain('alice@student.uq.edu.au')
  })

  it('keeps the same token when unshared and reshared', async () => {
    await alice('PATCH', `/api/timetables/${timetableId}`, { isShared: false })
    const off = await fetch(`${base}/api/share/${shareToken}`)
    expect(off.status).toBe(404)

    const on = await alice('PATCH', `/api/timetables/${timetableId}`, { isShared: true })
    expect(on.body.timetable.shareToken).toBe(shareToken)
  })

  it('stops another user reading or changing the timetable', async () => {
    const mallory = client()
    await mallory('POST', '/api/auth/register', {
      email: 'mallory@example.com', displayName: 'Mallory', password: 'password123',
    })

    expect((await mallory('GET', `/api/timetables/${timetableId}`)).status).toBe(404)
    expect((await mallory('DELETE', `/api/timetables/${timetableId}`)).status).toBe(404)
    expect(
      (await mallory('POST', `/api/timetables/${timetableId}/events`, {
        title: 'x', recurrence: 'weekly', dayOfWeek: 'Mon', startTime: '10:00', durationMins: 60,
      })).status,
    ).toBe(404)

    // Their own list is unaffected by Alice's data.
    const list = await mallory('GET', '/api/timetables')
    expect(list.body.timetables).toHaveLength(1)
    expect(list.body.timetables[0].id).not.toBe(timetableId)
  })

  it('requires a session for private routes', async () => {
    const anon = await fetch(`${base}/api/timetables`)
    expect(anon.status).toBe(401)
  })

  it('signs out and invalidates the session', async () => {
    await alice('POST', '/api/auth/logout')
    const me = await alice('GET', '/api/auth/me')
    expect(me.body.user).toBeNull()
  })
})
