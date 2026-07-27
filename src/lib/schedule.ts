import type { Category, CustomEvent, Day, Occurrence, PickedClass } from '../types'
import { DAYS } from '../types'
import { classLabel } from './labels'

/* ------------------------------------------------------------- date utils -- */

export function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

/** Monday of the week containing `d`. Weeks run Mon-Sun. */
export function mondayOf(d: Date): Date {
  const copy = new Date(d)
  const dow = copy.getDay() // 0 = Sun
  const delta = dow === 0 ? -6 : 1 - dow
  copy.setDate(copy.getDate() + delta)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function dayOfDate(iso: string): Day {
  return DAYS[(fromISO(iso).getDay() + 6) % 7]
}

/** "13:45" -> 825 */
export function minutesOf(hhmm: string | null): number {
  if (!hhmm) return 0
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function formatMins(total: number): string {
  const h = Math.floor(total / 60)
  const m = total % 60
  const suffix = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`
}

export function formatRange(start: number, end: number): string {
  return `${formatMins(start)} – ${formatMins(end)}`
}

/** 825 -> "13:45", the 24-hour form an <input type="time"> expects. */
export function toClock(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`
}

/** "3h 30m", for showing how long a chosen start-to-end span actually is. */
export function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}

export function formatDateLabel(iso: string): string {
  return fromISO(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/* ----------------------------------------------------------- occurrences -- */

/**
 * Expands the saved classes and events into concrete blocks for one Mon-Sun week.
 *
 * UQ classes carry an explicit list of dates, so they only appear in the weeks
 * they actually run. Weekly custom events repeat in every week; one-off events
 * appear only on their date.
 */
export function occurrencesForWeek(
  classes: PickedClass[],
  events: CustomEvent[],
  weekStart: Date,
): Occurrence[] {
  const weekDates = DAYS.map((_, i) => toISO(addDays(weekStart, i)))
  const dateSet = new Set(weekDates)
  const out: Occurrence[] = []

  // Labels depend on a class's siblings, so resolve them once up front.
  const labels = new Map(classes.map((c) => [c.id, classLabel(c, classes)]))

  for (const c of classes) {
    if (!c.startTime) continue
    const start = minutesOf(c.startTime)
    for (const date of c.dates) {
      if (!dateSet.has(date)) continue
      out.push({
        key: `c${c.id}-${date}`,
        kind: 'class',
        title: c.callistaCode,
        subtitle: labels.get(c.id) ?? c.activityGroupCode,
        location: c.location,
        day: dayOfDate(date),
        date,
        startMins: start,
        endMins: start + (c.durationMins || 60),
        category: null,
        classRef: c,
      })
    }
  }

  for (const e of events) {
    const start = minutesOf(e.startTime)
    const dates: string[] =
      e.recurrence === 'weekly'
        ? e.dayOfWeek
          ? [weekDates[DAYS.indexOf(e.dayOfWeek)]]
          : []
        : e.eventDate && dateSet.has(e.eventDate)
          ? [e.eventDate]
          : []

    for (const date of dates) {
      out.push({
        key: `e${e.id}-${date}`,
        kind: 'event',
        title: e.title,
        subtitle: e.category,
        location: e.location,
        day: dayOfDate(date),
        date,
        startMins: start,
        endMins: start + e.durationMins,
        category: e.category as Category,
        eventRef: e,
      })
    }
  }

  return out.sort((a, b) => a.startMins - b.startMins || a.endMins - b.endMins)
}

/**
 * Keys of blocks that overlap another block in time on the same day.
 * Recordings are excluded — they are watch-whenever, so they never truly clash.
 */
export function findClashes(occurrences: Occurrence[]): Set<string> {
  const clashing = new Set<string>()
  const attended = occurrences.filter(
    (o) => !/delayed viewing|recorded/i.test(`${o.location || ''} ${o.subtitle}`),
  )

  for (const day of DAYS) {
    const inDay = attended.filter((o) => o.day === day)
    for (let i = 0; i < inDay.length; i++) {
      for (let j = i + 1; j < inDay.length; j++) {
        if (inDay[i].startMins < inDay[j].endMins && inDay[j].startMins < inDay[i].endMins) {
          clashing.add(inDay[i].key)
          clashing.add(inDay[j].key)
        }
      }
    }
  }
  return clashing
}

export interface PositionedOccurrence extends Occurrence {
  column: number
  columnCount: number
}

/**
 * Assigns side-by-side columns so overlapping blocks on the same day stay
 * readable instead of stacking on top of each other.
 */
export function layoutDay(occurrences: Occurrence[]): PositionedOccurrence[] {
  const sorted = [...occurrences].sort((a, b) => a.startMins - b.startMins || a.endMins - b.endMins)
  const positioned: PositionedOccurrence[] = []

  let cluster: PositionedOccurrence[] = []
  let clusterEnd = -1

  const flush = () => {
    for (const item of cluster) item.columnCount = Math.max(...cluster.map((c) => c.column + 1))
    positioned.push(...cluster)
    cluster = []
    clusterEnd = -1
  }

  for (const o of sorted) {
    // A gap means the previous cluster of overlaps is finished.
    if (cluster.length && o.startMins >= clusterEnd) flush()

    const taken = new Set(
      cluster.filter((c) => c.startMins < o.endMins && o.startMins < c.endMins).map((c) => c.column),
    )
    let column = 0
    while (taken.has(column)) column++

    cluster.push({ ...o, column, columnCount: 1 })
    clusterEnd = Math.max(clusterEnd, o.endMins)
  }
  if (cluster.length) flush()

  return positioned
}

/** The time window the grid needs to show, padded to whole hours. */
export function gridBounds(occurrences: Occurrence[]): { start: number; end: number } {
  if (!occurrences.length) return { start: 8 * 60, end: 20 * 60 }
  const earliest = Math.min(...occurrences.map((o) => o.startMins))
  const latest = Math.max(...occurrences.map((o) => o.endMins))
  return {
    start: Math.min(8 * 60, Math.floor(earliest / 60) * 60),
    end: Math.max(20 * 60, Math.ceil(latest / 60) * 60),
  }
}

/** Earliest and latest dates across all saved classes, used to bound navigation. */
export function semesterRange(classes: PickedClass[]): { first: string; last: string } | null {
  const all = classes.flatMap((c) => c.dates)
  if (!all.length) return null
  return { first: all.reduce((a, b) => (a < b ? a : b)), last: all.reduce((a, b) => (a > b ? a : b)) }
}

/* ------------------------------------------------------------- ics export -- */

function icsEscape(text: string): string {
  return text.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n')
}

/**
 * Brisbane is UTC+10 year-round with no daylight saving, so converting to UTC
 * is a fixed 10-hour shift. That keeps the file simple and correct.
 */
function toUtcStamp(dateISO: string, mins: number): string {
  const [y, m, d] = dateISO.split('-').map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d, 0, mins - 600, 0))
  return `${utc.getUTCFullYear()}${String(utc.getUTCMonth() + 1).padStart(2, '0')}${String(
    utc.getUTCDate(),
  ).padStart(2, '0')}T${String(utc.getUTCHours()).padStart(2, '0')}${String(
    utc.getUTCMinutes(),
  ).padStart(2, '0')}00Z`
}

export function buildIcs(
  name: string,
  classes: PickedClass[],
  events: CustomEvent[],
  weekStart: Date,
): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//UQ Timetable Planner//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${icsEscape(name)}`,
    'X-WR-TIMEZONE:Australia/Brisbane',
  ]

  const push = (uid: string, start: string, end: string, summary: string, location: string, desc: string, rrule?: string) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}@uq-timetable-planner`,
      `DTSTAMP:${toUtcStamp(toISO(new Date()), 0)}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${icsEscape(summary)}`,
      ...(location ? [`LOCATION:${icsEscape(location)}`] : []),
      ...(desc ? [`DESCRIPTION:${icsEscape(desc)}`] : []),
      ...(rrule ? [`RRULE:${rrule}`] : []),
      'END:VEVENT',
    )
  }

  // Classes have real dates, so each session becomes its own event.
  for (const c of classes) {
    if (!c.startTime) continue
    const start = minutesOf(c.startTime)
    for (const date of c.dates) {
      push(
        `class-${c.id}-${date}`,
        toUtcStamp(date, start),
        toUtcStamp(date, start + (c.durationMins || 60)),
        `${c.callistaCode} ${c.activityType || c.activityGroupCode}`,
        c.location || '',
        [c.description, c.staff].filter(Boolean).join(' · '),
      )
    }
  }

  for (const e of events) {
    const start = minutesOf(e.startTime)
    if (e.recurrence === 'once' && e.eventDate) {
      push(
        `event-${e.id}`,
        toUtcStamp(e.eventDate, start),
        toUtcStamp(e.eventDate, start + e.durationMins),
        e.title,
        e.location || '',
        e.notes || '',
      )
    } else if (e.dayOfWeek) {
      // Anchor the repeat to this day in the week currently being viewed.
      const date = toISO(addDays(weekStart, DAYS.indexOf(e.dayOfWeek)))
      push(
        `event-${e.id}`,
        toUtcStamp(date, start),
        toUtcStamp(date, start + e.durationMins),
        e.title,
        e.location || '',
        e.notes || '',
        `FREQ=WEEKLY;BYDAY=${e.dayOfWeek.toUpperCase().slice(0, 2)};COUNT=26`,
      )
    }
  }

  lines.push('END:VCALENDAR')
  // RFC 5545 wants CRLF line endings.
  return lines.join('\r\n')
}
