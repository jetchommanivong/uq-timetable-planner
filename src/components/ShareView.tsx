import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import type { SharedTimetable } from '../types'
import { WeekGrid } from './WeekGrid'
import { WeekNav } from './WeekNav'
import { fromISO, mondayOf, occurrencesForWeek, semesterRange } from '../lib/schedule'

/** Read-only public view rendered at /s/:token. No sign-in required. */
export function ShareView({ token }: { token: string }) {
  const [data, setData] = useState<SharedTimetable | null>(null)
  const [error, setError] = useState<string | null>(null)
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

  const classes = useMemo(() => data?.classes ?? [], [data])
  const events = useMemo(() => data?.events ?? [], [data])

  if (error) {
    return (
      <Centered>
        <h1 className="text-lg font-semibold text-slate-900">Timetable unavailable</h1>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
        <a href="/" className="mt-4 inline-block text-sm font-medium text-indigo-600">
          Go to UQ Timetable Planner →
        </a>
      </Centered>
    )
  }

  if (!data) return <Centered><p className="text-sm text-slate-500">Loading…</p></Centered>

  return (
    <div className="flex h-full flex-col bg-slate-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-slate-900">{data.name}</h1>
          <p className="truncate text-xs text-slate-500">
            Shared by {data.ownerName} · read-only
          </p>
        </div>
        <a
          href="/"
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
        >
          Make your own
        </a>
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-hidden p-4">
        <WeekNav weekStart={weekStart} onChange={setWeekStart} classes={classes} />
        <div className="min-h-0 flex-1">
          <WeekGrid classes={classes} events={events} weekStart={weekStart} readOnly />
        </div>
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="text-center">{children}</div>
    </div>
  )
}
