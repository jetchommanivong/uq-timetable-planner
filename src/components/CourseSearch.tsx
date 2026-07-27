import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { PickedClass, UqActivity, UqCourse } from '../types'
import { courseSwatch } from '../lib/colors'
import { groupHint, groupLabel, selectedGroupCount } from '../lib/labels'
import { formatRange, minutesOf } from '../lib/schedule'

interface Props {
  picked: PickedClass[]
  onPick: (course: UqCourse, activity: UqActivity) => Promise<void>
  /** Errors from the parent, shown here so failures aren't hidden behind the dialog. */
  error?: string | null
  onDismissError?: () => void
  onClose: () => void
}

export function CourseSearch({ picked, onPick, error: actionError, onDismissError, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [courses, setCourses] = useState<UqCourse[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => inputRef.current?.focus(), [])

  // Debounced search so we aren't hammering UQ on every keystroke.
  useEffect(() => {
    const term = query.trim()
    if (term.length < 2) {
      setCourses([])
      setSearched(false)
      return
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await api.searchCourses(term)
        if (cancelled) return
        setCourses(res.courses)
        setSearched(true)
        if (res.courses.length === 1) setExpanded(res.courses[0].subjectCode)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Search failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 350)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  const pickedKey = (subjectCode: string, group: string, code: string) =>
    picked.some(
      (p) =>
        p.subjectCode === subjectCode && p.activityGroupCode === group && p.activityCode === code,
    )

  /** Group codes of a course the user has already chosen from. */
  const chosenGroups = (course: UqCourse) =>
    new Set(
      picked.filter((p) => p.subjectCode === course.subjectCode).map((p) => p.activityGroupCode),
    )

  // Lets us jump the user straight to whatever they still have to pick.
  const groupRefs = useRef(new Map<string, HTMLDivElement | null>())
  const refKey = (subjectCode: string, groupCode: string) => `${subjectCode}|${groupCode}`

  function scrollToGroup(subjectCode: string, groupCode: string) {
    // Optional call: jsdom (and older browsers) don't implement scrollIntoView.
    groupRefs.current
      .get(refKey(subjectCode, groupCode))
      ?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  }

  /**
   * After a pick, move the user to the next group they still owe. Courses like
   * DECO3500 have two studio groups you attend both of, and it's far too easy
   * to add the first and assume you're finished.
   */
  async function pickThenAdvance(course: UqCourse, activity: UqActivity) {
    await onPick(course, activity)

    const chosen = chosenGroups(course)
    chosen.add(activity.activityGroupCode)
    const next = course.groups.find((g) => !chosen.has(g.code))
    if (next) scrollToGroup(course.subjectCode, next.code)
  }

  /** The course currently expanded, used to drive the sticky footer. */
  const openCourse = courses.find((c) => c.subjectCode === expanded) ?? null
  const openMissing = openCourse
    ? openCourse.groups.filter((g) => !chosenGroups(openCourse).has(g.code))
    : []

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:p-8">
      <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-200 p-4">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a course code or name — e.g. CSSE2310 or 'calculus'"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-base font-medium text-slate-700 hover:bg-slate-100"
          >
            Done
          </button>
        </div>

        {actionError && (
          <div className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
            <span className="flex-1">
              <strong className="font-semibold">Couldn't save that class.</strong> {actionError}
            </span>
            {onDismissError && (
              <button onClick={onDismissError} className="font-semibold">
                Dismiss
              </button>
            )}
          </div>
        )}

        <div className="thin-scroll flex-1 overflow-y-auto p-4">
          {loading && <p className="py-10 text-center text-base text-slate-500">Searching UQ…</p>}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          {!loading && !error && searched && courses.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">
              No courses matched “{query.trim()}”.
            </p>
          )}

          {!loading && !searched && !error && (
            <div className="py-8 text-center text-sm text-slate-500">
              <p>Start typing to search UQ's public timetable.</p>
              <p className="mt-1 text-xs text-slate-400">
                A course usually offers one lecture stream plus a tutorial or prac you choose.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {courses.map((course) => {
              const swatch = courseSwatch(course.callistaCode)
              const isOpen = expanded === course.subjectCode
              const added = selectedGroupCount(course, picked)
              const complete = added === course.groups.length && added > 0

              // Warn when a course runs several groups of the same type (two
              // studios, two lecture streams) — those are all attended, not
              // alternatives, and it's the easiest thing to get wrong.
              const repeatedTypes = [
                ...new Set(
                  course.groups
                    .map((g) => g.type || g.code)
                    .filter((t, _i, arr) => arr.filter((x) => x === t).length > 1),
                ),
              ]

              return (
                <div
                  key={course.subjectCode}
                  className="overflow-hidden rounded-xl border border-slate-200"
                >
                  <button
                    onClick={() => setExpanded(isOpen ? null : course.subjectCode)}
                    className="flex w-full items-center gap-3 bg-white px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <span
                      className="h-8 w-1.5 shrink-0 rounded-full"
                      style={{ background: swatch.dot }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold text-slate-900">
                        {course.callistaCode}
                        <span className="ml-2 font-normal text-slate-500">{course.description}</span>
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-slate-500">
                        <span>
                          {course.semester} · {course.campus}
                        </span>
                        <span
                          className={
                            complete
                              ? 'font-medium text-emerald-600'
                              : added > 0
                                ? 'font-medium text-amber-600'
                                : ''
                          }
                        >
                          {added} of {course.groups.length} added
                        </span>
                      </span>
                    </span>
                    <span className="text-slate-400">{isOpen ? '−' : '+'}</span>
                  </button>

                  {isOpen && (
                    <div className="space-y-4 border-t border-slate-200 bg-slate-50 p-4">
                      {repeatedTypes.length > 0 && (
                        <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                          This course runs more than one{' '}
                          {repeatedTypes.map((t) => t.toLowerCase()).join(' and ')} session — they're
                          separate classes you attend in addition to each other, not alternatives.
                          Add one from every group below.
                        </p>
                      )}
                      {course.groups.map((group) => {
                        const groupDone = chosenGroups(course).has(group.code)
                        return (
                        <div
                          key={group.code}
                          ref={(el) => {
                            groupRefs.current.set(refKey(course.subjectCode, group.code), el)
                          }}
                          className={`rounded-lg p-2 transition ${
                            groupDone ? '' : 'bg-amber-50/60 ring-1 ring-amber-200'
                          }`}
                        >
                          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                            <span
                              className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                                groupDone
                                  ? 'bg-emerald-500 text-white'
                                  : 'border border-amber-400 text-transparent'
                              }`}
                              aria-hidden
                            >
                              ✓
                            </span>
                            {groupLabel(course, group)}
                            <span className="font-normal normal-case tracking-normal text-slate-400">
                              {groupDone ? 'added' : groupHint(group)}
                            </span>
                          </h4>
                          <div className="grid gap-1.5 sm:grid-cols-2">
                            {group.options.map((opt) => {
                              const isPicked = pickedKey(
                                course.subjectCode,
                                opt.activityGroupCode,
                                opt.activityCode,
                              )
                              const full = opt.availability === 0
                              return (
                                <button
                                  key={opt.id}
                                  onClick={() => pickThenAdvance(course, opt)}
                                  className={`rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                                    isPicked
                                      ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold text-slate-900">
                                      {opt.activityCode}
                                    </span>
                                    {isPicked && (
                                      <span className="text-xs font-semibold text-indigo-600">
                                        ADDED
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-1 text-slate-700">
                                    {opt.dayOfWeek && opt.startTime ? (
                                      <>
                                        {opt.dayOfWeek}{' '}
                                        {formatRange(
                                          minutesOf(opt.startTime),
                                          minutesOf(opt.startTime) + opt.durationMins,
                                        )}
                                      </>
                                    ) : (
                                      <span className="text-slate-400">No scheduled time</span>
                                    )}
                                  </div>
                                  <div className="mt-0.5 truncate text-slate-500" title={opt.location}>
                                    {opt.location || '—'}
                                  </div>
                                  {(full || opt.isRecording) && (
                                    <div className="mt-1 flex gap-1">
                                      {opt.isRecording && (
                                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                                          recording
                                        </span>
                                      )}
                                      {full && (
                                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
                                          full
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/*
          The thing that actually bit people: adding one group and assuming the
          course was done. This bar stays visible and names what's outstanding.
        */}
        {openCourse && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            {openMissing.length === 0 ? (
              <span className="font-medium text-emerald-700">
                ✓ {openCourse.callistaCode} complete — all {openCourse.groups.length} added
              </span>
            ) : (
              <>
                <span className="text-amber-700">
                  <span className="font-semibold">{openCourse.callistaCode}</span> still needs{' '}
                  {openMissing.length} of {openCourse.groups.length}:
                </span>
                {openMissing.map((g) => (
                  <button
                    key={g.code}
                    onClick={() => scrollToGroup(openCourse.subjectCode, g.code)}
                    className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 font-medium text-amber-800 hover:bg-amber-200"
                  >
                    {groupLabel(openCourse, g)}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
