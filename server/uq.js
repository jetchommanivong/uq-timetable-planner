/**
 * Thin client for UQ's public timetable API.
 *
 * Verified against the live service:
 *   POST https://timetable.my.uq.edu.au/aplus/rest/timetable/subjects
 *   - POST only (GET returns 405)
 *   - no authentication
 *   - application/x-www-form-urlencoded
 *   - sends NO Access-Control-Allow-Origin header, which is exactly why this
 *     has to live server-side instead of in the browser
 *   - caps results at 100 per query
 *
 * Param names come from the service's own WADL description:
 *   search-term, campus, semester, type, faculty, days, start-time, end-time
 */
const UQ_ENDPOINT = 'https://timetable.my.uq.edu.au/aplus/rest/timetable/subjects'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Small in-process cache. UQ's dataset changes rarely and this keeps repeated
// searches snappy while being polite to their server.
const cache = new Map()
const CACHE_TTL_MS = 10 * 60 * 1000

/** UQ returns dates as "23/2/2026" (D/M/YYYY). Normalise to "2026-02-23". */
function toIsoDate(ddmmyyyy) {
  if (typeof ddmmyyyy !== 'string') return null
  const m = ddmmyyyy.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const [, d, mo, y] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function normaliseActivity(raw, key) {
  const dates = Array.isArray(raw.activitiesDays)
    ? raw.activitiesDays.map(toIsoDate).filter(Boolean).sort()
    : []

  return {
    id: key,
    subjectCode: raw.subject_code,
    activityGroupCode: raw.activity_group_code,
    activityCode: raw.activity_code,
    activityType: raw.activity_type || '',
    dayOfWeek: DAYS.includes(raw.day_of_week) ? raw.day_of_week : null,
    startTime: raw.start_time || null,
    durationMins: Number.parseInt(raw.duration, 10) || 0,
    location: raw.location || '',
    staff: raw.staff || '',
    campus: raw.campus || '',
    availability: Number.isFinite(raw.availability) ? raw.availability : null,
    selectable: raw.selectable || '',
    // UQ hands back "#" for some rows, which is not a usable colour.
    color: /^#[0-9a-f]{3,8}$/i.test(raw.color || '') ? raw.color : null,
    dates,
    // "Delayed viewing" rows are recordings, not something you physically attend.
    isRecording: /recorded|delayed viewing/i.test(
      `${raw.activity_type || ''} ${raw.location || ''}`,
    ),
  }
}

function normaliseCourse(raw, key) {
  const activities = Object.entries(raw.activities || {}).map(([k, a]) =>
    normaliseActivity(a, k),
  )

  // Group by activity_group_code (LEC01, TUT01, PRA01 ...). You pick exactly
  // one option out of each group, which is what makes this a planner.
  const groups = new Map()
  for (const a of activities) {
    if (!groups.has(a.activityGroupCode)) {
      groups.set(a.activityGroupCode, {
        code: a.activityGroupCode,
        type: a.activityType,
        options: [],
      })
    }
    const g = groups.get(a.activityGroupCode)
    g.options.push(a)
    if (!g.type && a.activityType) g.type = a.activityType
  }

  for (const g of groups.values()) {
    g.options.sort((x, y) => x.activityCode.localeCompare(y.activityCode, undefined, { numeric: true }))
  }

  return {
    subjectCode: key,
    callistaCode: raw.callista_code,
    description: raw.description,
    semester: raw.semester,
    campus: raw.campus,
    manager: raw.manager || '',
    groups: [...groups.values()].sort((a, b) => a.code.localeCompare(b.code)),
  }
}

export async function searchSubjects(searchTerm, opts = {}) {
  const term = (searchTerm || '').trim()
  if (term.length < 2) return []

  const cacheKey = JSON.stringify([term.toUpperCase(), opts])
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value

  const body = new URLSearchParams()
  body.set('search-term', term)
  body.set('semester', opts.semester || 'ALL')
  body.set('campus', opts.campus || 'ALL')
  body.set('faculty', opts.faculty || 'ALL')
  body.set('type', opts.type || 'ALL')
  body.set('start-time', '00:00')
  body.set('end-time', '23:00')
  for (const d of ['0', '1', '2', '3', '4', '5', '6']) body.append('days', d)

  const res = await fetch(UQ_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
    signal: AbortSignal.timeout(20_000),
  })

  if (!res.ok) {
    throw Object.assign(new Error(`UQ timetable API returned ${res.status}`), {
      status: 502,
    })
  }

  const json = await res.json()
  // A miss comes back as an empty object, or occasionally an error-ish payload.
  const value =
    json && typeof json === 'object' && !Array.isArray(json)
      ? Object.entries(json)
          .filter(([, v]) => v && typeof v === 'object' && v.callista_code)
          .map(([k, v]) => normaliseCourse(v, k))
          .sort((a, b) => a.subjectCode.localeCompare(b.subjectCode))
      : []

  cache.set(cacheKey, { at: Date.now(), value })
  return value
}
