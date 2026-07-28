import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import type {
  CustomEvent,
  Day,
  FollowedTimetable,
  PickedClass,
  Timetable,
  TimetableSummary,
  UqActivity,
  UqCourse,
  User,
} from './types'
import { AuthScreen } from './components/AuthScreen'
import { CourseSearch } from './components/CourseSearch'
import { EventDialog } from './components/EventDialog'
import { ShareView } from './components/ShareView'
import { Sidebar } from './components/Sidebar'
import { WeekGrid } from './components/WeekGrid'
import { WeekNav } from './components/WeekNav'
import { buildIcs, fromISO, mondayOf, occurrencesForWeek, semesterRange, toISO } from './lib/schedule'
import { exportTimetableImage } from './lib/exportImage'

export default function App() {
  // Single public route: /s/:token renders the read-only shared view.
  const shareToken = window.location.pathname.startsWith('/s/')
    ? decodeURIComponent(window.location.pathname.slice(3))
    : null
  if (shareToken) return <ShareView token={shareToken} />

  return <PlannerApp />
}

function PlannerApp() {
  const [user, setUser] = useState<User | null>(null)
  const [booted, setBooted] = useState(false)
  const [summaries, setSummaries] = useState<TimetableSummary[]>([])
  const [timetable, setTimetable] = useState<Timetable | null>(null)
  const [follows, setFollows] = useState<FollowedTimetable[]>([])
  const [visibleFollowIds, setVisibleFollowIds] = useState<Set<number>>(new Set())
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()))
  const [searchOpen, setSearchOpen] = useState(false)
  // `editing: false` with an event present means "duplicate this one".
  const [eventDialog, setEventDialog] = useState<{
    open: boolean
    event: CustomEvent | null
    editing: boolean
  }>({ open: false, event: null, editing: false })
  const [error, setError] = useState<string | null>(null)

  /** Refreshes the sidebar list and loads `preferId` (or the most recent). */
  const loadTimetables = useCallback(async (preferId?: number) => {
    const { timetables } = await api.listTimetables()
    setSummaries(timetables)

    const target = preferId ?? timetables[0]?.id
    if (target == null) {
      setTimetable(null)
      return
    }
    const { timetable: full } = await api.getTimetable(target)
    setTimetable(full)
  }, [])

  /** Refreshes the followed-people list. New follows default to visible. */
  const loadFollows = useCallback(async () => {
    const { follows: fetched } = await api.listFollows()
    setFollows(fetched)
    setVisibleFollowIds((prev) => {
      const next = new Set(prev)
      for (const f of fetched) if (!prev.has(f.id)) next.add(f.id)
      return next
    })
  }, [])

  useEffect(() => {
    api
      .me()
      .then(async ({ user }) => {
        setUser(user)
        if (user) await Promise.all([loadTimetables(), loadFollows()])
      })
      .catch(() => {})
      .finally(() => setBooted(true))
  }, [loadTimetables, loadFollows])

  // Semesters rarely overlap with "today", so opening on an empty week makes the
  // app look broken. When the current week has nothing, jump to the first week
  // that does. Keyed on timetable id so it never fights manual navigation.
  const timetableId = timetable?.id
  useEffect(() => {
    if (!timetable?.classes.length) return
    const thisWeek = mondayOf(new Date())
    if (occurrencesForWeek(timetable.classes, [], thisWeek).length > 0) return
    const range = semesterRange(timetable.classes)
    if (range) setWeekStart(mondayOf(fromISO(range.first)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timetableId])

  /** Runs a mutation that returns the updated timetable, surfacing errors. */
  const mutate = useCallback(
    async (fn: () => Promise<{ timetable: Timetable }>) => {
      setError(null)
      try {
        const res = await fn()
        // Never blank out the timetable on a malformed response: doing so
        // unmounts whatever the user has open, which looks like the app
        // throwing them back to the calendar for no reason.
        if (!res?.timetable) throw new Error('The server sent back an unexpected response')
        setTimetable(res.timetable)
        const { timetables } = await api.listTimetables()
        setSummaries(timetables)
        return true
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong')
        return false
      }
    },
    [],
  )

  if (!booted) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    )
  }

  if (!user) {
    return (
      <AuthScreen
        onSignedIn={async (u) => {
          setUser(u)
          await Promise.all([loadTimetables(), loadFollows()])
        }}
      />
    )
  }

  async function handlePick(course: UqCourse, activity: UqActivity) {
    if (!timetable) return
    await mutate(() =>
      api.addClass(timetable.id, {
        subjectCode: course.subjectCode,
        callistaCode: course.callistaCode,
        description: course.description,
        semester: course.semester,
        campus: course.campus,
        activityGroupCode: activity.activityGroupCode,
        activityCode: activity.activityCode,
        activityType: activity.activityType,
        dayOfWeek: activity.dayOfWeek,
        startTime: activity.startTime,
        durationMins: activity.durationMins,
        location: activity.location,
        staff: activity.staff,
        color: activity.color,
        dates: activity.dates,
      }),
    )
  }

  /** Slugified timetable name, used for downloaded filenames. */
  function fileStem() {
    return (timetable?.name ?? 'timetable').replace(/[^\w-]+/g, '-').toLowerCase()
  }

  function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleExportIcs() {
    if (!timetable) return
    const ics = buildIcs(timetable.name, timetable.classes, timetable.events, weekStart)
    download(new Blob([ics], { type: 'text/calendar;charset=utf-8' }), `${fileStem()}.ics`)
  }

  async function handleExportImage(format: 'png' | 'jpeg') {
    if (!timetable) return
    setError(null)
    try {
      const blob = await exportTimetableImage(
        {
          name: timetable.name,
          subtitle: `${user!.displayName}'s timetable`,
          classes: timetable.classes,
          events: timetable.events,
          weekStart,
        },
        format,
      )
      download(blob, `${fileStem()}-${toISO(weekStart)}.${format === 'png' ? 'png' : 'jpg'}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the image')
    }
  }

  /** Accepts either a bare share code or a full pasted `/s/:token` link. */
  function parseShareToken(input: string): string {
    const trimmed = input.trim()
    const marker = '/s/'
    const at = trimmed.indexOf(marker)
    return at === -1 ? trimmed : decodeURIComponent(trimmed.slice(at + marker.length))
  }

  async function handleAddFollow(input: string): Promise<boolean> {
    setError(null)
    try {
      const { follows: updated } = await api.addFollow(parseShareToken(input))
      setFollows(updated)
      setVisibleFollowIds((prev) => {
        const next = new Set(prev)
        for (const f of updated) if (!prev.has(f.id)) next.add(f.id)
        return next
      })
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add that timetable')
      return false
    }
  }

  async function handleRemoveFollow(id: number) {
    setError(null)
    try {
      const { follows: updated } = await api.removeFollow(id)
      setFollows(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove that timetable')
    }
  }

  function handleToggleFollowVisible(id: number) {
    setVisibleFollowIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /**
   * Saves the dialog. A weekly event can name several days at once, which
   * becomes one event per day so each can later be edited or removed alone.
   */
  async function handleSaveEvent(body: Record<string, unknown>) {
    if (!timetable) return
    const { daysOfWeek, ...rest } = body as { daysOfWeek?: Day[] } & Record<string, unknown>
    const days = rest.recurrence === 'weekly' ? (daysOfWeek ?? []) : [null]
    const existing = eventDialog.editing ? eventDialog.event : null

    // Reuse the row being edited for the first day, then add any extras.
    const [first, ...others] = days
    if (existing) {
      await mutate(() =>
        api.updateEvent(timetable.id, existing.id, { ...rest, dayOfWeek: first }),
      )
    } else {
      await mutate(() => api.addEvent(timetable.id, { ...rest, dayOfWeek: first }))
    }
    for (const day of others) {
      await mutate(() => api.addEvent(timetable.id, { ...rest, dayOfWeek: day }))
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <h1 className="text-base font-bold tracking-tight text-slate-900">UQ Timetable Planner</h1>
        <span className="ml-auto text-sm text-slate-500">{user.displayName}</span>
        <button
          onClick={async () => {
            await api.logout()
            setUser(null)
            setTimetable(null)
            setSummaries([])
            setFollows([])
            setVisibleFollowIds(new Set())
          }}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Sign out
        </button>
      </header>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="font-semibold">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {timetable ? (
          <>
            <Sidebar
              timetable={timetable}
              summaries={summaries}
              onSwitchTimetable={(id) => loadTimetables(id)}
              onCreateTimetable={async () => {
                const { timetable: created } = await api.createTimetable('New timetable')
                await loadTimetables(created.id)
              }}
              onRenameTimetable={(name) =>
                mutate(() => api.updateTimetable(timetable.id, { name }))
              }
              onDeleteTimetable={async () => {
                if (!confirm(`Delete “${timetable.name}”? This cannot be undone.`)) return
                await api.deleteTimetable(timetable.id)
                // Falls back to the most recent remaining timetable.
                await loadTimetables()
              }}
              onOpenSearch={() => setSearchOpen(true)}
              onAddEvent={() => setEventDialog({ open: true, event: null, editing: false })}
              onEditEvent={(event) => setEventDialog({ open: true, event, editing: true })}
              onRemoveClass={(cls: PickedClass) =>
                mutate(() => api.removeClass(timetable.id, cls.id))
              }
              onRemoveCourse={(subjectCode) =>
                mutate(() => api.removeCourse(timetable.id, subjectCode))
              }
              onToggleShare={(isShared) =>
                mutate(() => api.updateTimetable(timetable.id, { isShared }))
              }
              onExportIcs={handleExportIcs}
              onExportImage={handleExportImage}
              follows={follows}
              visibleFollowIds={visibleFollowIds}
              onToggleFollowVisible={handleToggleFollowVisible}
              onAddFollow={handleAddFollow}
              onRemoveFollow={handleRemoveFollow}
            />

            <main className="flex min-w-0 flex-1 flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <WeekNav
                  weekStart={weekStart}
                  onChange={setWeekStart}
                  classes={timetable.classes}
                />
                <p className="ml-auto text-sm text-slate-400">
                  Click a class to remove it · click an event to edit
                </p>
              </div>

              <div className="min-h-0 flex-1">
                <WeekGrid
                  classes={timetable.classes}
                  events={timetable.events}
                  weekStart={weekStart}
                  overlays={follows
                    .filter((f) => f.available && visibleFollowIds.has(f.id))
                    .map((f) => ({
                      key: String(f.timetableId),
                      name: f.ownerName,
                      classes: f.classes,
                      events: f.events,
                    }))}
                  onSelectEvent={(event) => setEventDialog({ open: true, event, editing: true })}
                  onRemoveClass={(cls) => mutate(() => api.removeClass(timetable.id, cls.id))}
                />
              </div>
            </main>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <button
              onClick={async () => {
                const { timetable: created } = await api.createTimetable('My timetable')
                await loadTimetables(created.id)
              }}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Create your first timetable
            </button>
          </div>
        )}
      </div>

      {/*
        Deliberately not gated on `timetable`. The dialog must only ever close
        because the user asked it to — never as a side effect of state churn.
      */}
      {searchOpen && (
        <CourseSearch
          picked={timetable?.classes ?? []}
          onPick={handlePick}
          error={error}
          onDismissError={() => setError(null)}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {eventDialog.open && timetable && (
        <EventDialog
          // Remounts when switching between editing and duplicating so the
          // form state is rebuilt from the new starting point.
          key={`${eventDialog.editing ? 'edit' : 'new'}-${eventDialog.event?.id ?? 'blank'}`}
          initial={eventDialog.event}
          isEditing={eventDialog.editing}
          onSave={handleSaveEvent}
          onDuplicate={
            eventDialog.editing && eventDialog.event
              ? () => setEventDialog({ open: true, event: eventDialog.event, editing: false })
              : undefined
          }
          onDelete={
            eventDialog.editing && eventDialog.event
              ? async () => {
                  await mutate(() => api.removeEvent(timetable.id, eventDialog.event!.id))
                }
              : undefined
          }
          onClose={() => setEventDialog({ open: false, event: null, editing: false })}
        />
      )}
    </div>
  )
}
