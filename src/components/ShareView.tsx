import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import type { PickedClass, SharedTimetable } from '../types'
import { WeekGrid } from './WeekGrid'
import { WeekNav } from './WeekNav'
import { courseSwatch } from '../lib/colors'
import { fromISO, mondayOf, occurrencesForWeek, semesterRange } from '../lib/schedule'

/** Read-only public view rendered at /s/:token. No sign-in required. */
export function ShareView({ token }: { token: string }) {
  const [data, setData] = useState<SharedTimetable | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()))

  useEffect(() => {
    api
      .getShared(token)
      .then((r) => {
        setData(r.timetable)
        // Open on a week that actually has classes rather than an empty grid.
        const thisWeek = mondayOf(new Date())
        if (r.timetable.classes.length && !occurrencesForWeek(r.timetable.classes, [], thisWeek).length) {
          const range = semesterRange(r.timetable.classes)
          if (range) setWeekStart(mondayOf(fromISO(range.first)))
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load'))
  }, [token])

  // A shared link often sits in a tab for days — name the tab something useful.
  useEffect(() => {
    if (data) document.title = `${data.ownerName} · ${data.name}`
  }, [data])

  const classes = useMemo(() => data?.classes ?? [], [data])
  const events = useMemo(() => data?.events ?? [], [data])

  /** One entry per course, in the order they first appear. */
  const courses = useMemo(() => {
    const byCode = new Map<string, PickedClass>()
    for (const c of classes) if (!byCode.has(c.callistaCode)) byCode.set(c.callistaCode, c)
    return [...byCode.values()]
  }, [classes])

  const thisWeek = useMemo(
    () => occurrencesForWeek(classes, events, weekStart),
    [classes, events, weekStart],
  )

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be denied; the address bar still has the link.
    }
  }

  if (error) {
    return (
      <Centered>
        <h1 className="text-lg font-semibold text-slate-900">Timetable unavailable</h1>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
        <p className="mt-1 text-sm text-slate-500">
          The link may have expired, or sharing may have been turned off.
        </p>
        <a
          href="/"
          className="mt-5 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Go to UQ Timetable Planner
        </a>
      </Centered>
    )
  }

  if (!data) return <Centered><p className="text-sm text-slate-500">Loading…</p></Centered>

  return (
    <div className="flex h-full flex-col bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-600 text-sm font-bold text-white"
          >
            {initials(data.ownerName)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold text-slate-900 sm:text-base">
              {data.name}
            </h1>
            <p className="truncate text-xs text-slate-500">
              {data.ownerName} · {courses.length} course{courses.length === 1 ? '' : 's'} ·
              read-only
            </p>
          </div>
          <button
            onClick={handleCopy}
            className="hidden shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:block"
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <a
            href="/"
            className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            Make your own
          </a>
        </div>

        {/* Codes alone say nothing to anyone but the owner, and the grid blocks
            are too small for full course names. The legend carries them. */}
        {courses.length > 0 && (
          <div className="thin-scroll flex gap-2 overflow-x-auto px-4 pb-3 sm:flex-wrap sm:overflow-visible sm:px-5">
            {courses.map((c) => {
              const sw = courseSwatch(c.callistaCode)
              return (
                <span
                  key={c.callistaCode}
                  title={c.description}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border py-1 pl-2 pr-2.5 text-xs"
                  style={{ background: sw.bg, borderColor: sw.border, color: sw.text }}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: sw.border }}
                    aria-hidden
                  />
                  <span className="font-semibold">{c.callistaCode}</span>
                  <span className="hidden max-w-[16rem] truncate opacity-75 md:inline">
                    {c.description}
                  </span>
                </span>
              )
            })}
          </div>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-hidden p-3 sm:p-4">
        <WeekNav weekStart={weekStart} onChange={setWeekStart} classes={classes} />

        {thisWeek.length === 0 && (
          <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
            Nothing scheduled in this week — try the arrows to move to another one.
          </p>
        )}

        <div className="min-h-0 flex-1">
          <WeekGrid classes={classes} events={events} weekStart={weekStart} readOnly />
        </div>
      </div>
    </div>
  )
}

/** "Alex Nguyen" -> "AN", for the owner badge. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-sm text-center">{children}</div>
    </div>
  )
}
