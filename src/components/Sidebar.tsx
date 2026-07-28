import { useMemo, useState } from 'react'
import type { CustomEvent, FollowedTimetable, PickedClass, Timetable, TimetableSummary } from '../types'
import { CATEGORY_LABEL, categorySwatch, courseSwatch } from '../lib/colors'
import { classLabel } from '../lib/labels'
import { formatMins, formatRange, minutesOf } from '../lib/schedule'
import { PeoplePanel } from './PeoplePanel'

interface Props {
  timetable: Timetable
  summaries: TimetableSummary[]
  onSwitchTimetable: (id: number) => void
  onCreateTimetable: () => void
  onRenameTimetable: (name: string) => void
  onDeleteTimetable: () => void
  onOpenSearch: () => void
  onAddEvent: () => void
  onEditEvent: (event: CustomEvent) => void
  onRemoveClass: (cls: PickedClass) => void
  onRemoveCourse: (subjectCode: string) => void
  onToggleShare: (shared: boolean) => void
  onExportIcs: () => void
  onExportImage: (format: 'png' | 'jpeg') => void
  follows: FollowedTimetable[]
  visibleFollowIds: Set<number>
  onToggleFollowVisible: (id: number) => void
  onAddFollow: (shareTokenOrLink: string) => Promise<boolean>
  onRemoveFollow: (id: number) => void
  /** Controls the slide-in drawer presentation below the `md` breakpoint. */
  open: boolean
  onClose: () => void
}

export function Sidebar(props: Props) {
  const { timetable } = props
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(timetable.name)
  const [copied, setCopied] = useState(false)

  // Group the picked classes under their course so the list reads like an enrolment.
  const courses = useMemo(() => {
    const map = new Map<string, { code: string; description: string; classes: PickedClass[] }>()
    for (const c of timetable.classes) {
      if (!map.has(c.subjectCode)) {
        map.set(c.subjectCode, { code: c.callistaCode, description: c.description, classes: [] })
      }
      map.get(c.subjectCode)!.classes.push(c)
    }
    return [...map.entries()].sort((a, b) => a[1].code.localeCompare(b[1].code))
  }, [timetable.classes])

  const shareUrl = timetable.shareToken
    ? `${window.location.origin}/s/${timetable.shareToken}`
    : null

  async function copyShare() {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be blocked; the input below still allows manual copying.
    }
  }

  return (
    <>
      {/* Below `md`, the sidebar is a slide-in drawer — this dims and closes it. */}
      {props.open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 md:hidden"
          onClick={props.onClose}
          aria-hidden
        />
      )}
      <aside
        className={`thin-scroll fixed inset-y-0 left-0 z-40 flex w-[85vw] max-w-96 shrink-0 flex-col gap-7 overflow-y-auto border-r border-slate-200 bg-white p-5 transition-transform duration-200 ease-out ${
          props.open ? 'translate-x-0' : '-translate-x-full'
        } md:static md:z-auto md:w-96 md:max-w-none md:translate-x-0 md:transition-none`}
      >
        <div className="flex items-center justify-between md:hidden">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Menu</h2>
          <button
            onClick={props.onClose}
            aria-label="Close menu"
            className="rounded px-2 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ×
          </button>
        </div>

        {/*
        Timetable management. New and Delete sit together here rather than at
        opposite ends of the sidebar, and neither sits next to "Add a class" —
        those used to look alike and get clicked by mistake.
      */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Timetable
        </h2>

        {renaming ? (
          <div className="flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-indigo-500"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  props.onRenameTimetable(draftName)
                  setRenaming(false)
                }
                if (e.key === 'Escape') setRenaming(false)
              }}
            />
            <button
              onClick={() => {
                props.onRenameTimetable(draftName)
                setRenaming(false)
              }}
              className="rounded-lg bg-slate-900 px-3 text-sm font-medium text-white"
            >
              Save
            </button>
          </div>
        ) : (
          <>
            {props.summaries.length > 1 && (
              <select
                value={timetable.id}
                onChange={(e) => props.onSwitchTimetable(Number(e.target.value))}
                className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-indigo-500"
              >
                {props.summaries.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}

            <p className="truncate text-lg font-semibold text-slate-900">{timetable.name}</p>

            <div className="mt-2.5 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setDraftName(timetable.name)
                  setRenaming(true)
                }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Rename
              </button>
              <button
                onClick={props.onCreateTimetable}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                New timetable
              </button>
              <button
                onClick={props.onDeleteTimetable}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          </>
        )}
      </section>

      {/* Courses */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Courses
        </h2>

        <button
          onClick={props.onOpenSearch}
          className="mb-3 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-base font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          + Add a class
        </button>

        {courses.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
            Search UQ and add your first class.
          </p>
        ) : (
          <div className="space-y-2.5">
            {courses.map(([subjectCode, course]) => {
              const sw = courseSwatch(course.code)
              return (
                <div key={subjectCode} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start gap-2.5">
                    <span
                      className="mt-1.5 h-3 w-3 shrink-0 rounded-full"
                      style={{ background: sw.dot }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-semibold text-slate-900">
                        {course.code}
                      </div>
                      <div className="truncate text-sm text-slate-500">{course.description}</div>
                    </div>
                    <button
                      onClick={() => props.onRemoveCourse(subjectCode)}
                      title="Remove course"
                      aria-label={`Remove ${course.code}`}
                      className="rounded px-1.5 text-lg leading-none text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      ×
                    </button>
                  </div>

                  <ul className="mt-2 space-y-1">
                    {course.classes
                      .slice()
                      .sort((a, b) => minutesOf(a.startTime) - minutesOf(b.startTime))
                      .map((c) => {
                        const start = minutesOf(c.startTime)
                        return (
                          <li
                            key={c.id}
                            className="group flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50"
                          >
                            <span className="font-medium text-slate-700">
                              {classLabel(c, timetable.classes)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-slate-500">
                              {c.dayOfWeek}{' '}
                              {c.startTime ? formatRange(start, start + c.durationMins) : ''}
                            </span>
                            <button
                              onClick={() => props.onRemoveClass(c)}
                              className="text-base leading-none text-slate-400 opacity-0 transition hover:text-red-600 group-hover:opacity-100"
                              title="Remove class"
                              aria-label={`Remove ${classLabel(c, timetable.classes)}`}
                            >
                              ×
                            </button>
                          </li>
                        )
                      })}
                  </ul>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Everything else */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Life outside class
        </h2>

        <button
          onClick={props.onAddEvent}
          className="mb-3 w-full rounded-lg border-2 border-dashed border-slate-300 px-4 py-2.5 text-base font-medium text-slate-600 transition hover:border-indigo-400 hover:text-indigo-600"
        >
          + Add work, gym, social…
        </button>

        {timetable.events.length > 0 && (
          <div className="space-y-1">
            {timetable.events
              .slice()
              .sort((a, b) => minutesOf(a.startTime) - minutesOf(b.startTime))
              .map((e) => {
                const sw = categorySwatch(e.category)
                const start = minutesOf(e.startTime)
                return (
                  <button
                    key={e.id}
                    onClick={() => props.onEditEvent(e)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-slate-50"
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ background: sw.dot }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-medium text-slate-800">
                        {e.title}
                      </span>
                      <span className="block truncate text-sm text-slate-500">
                        {e.recurrence === 'weekly' ? e.dayOfWeek : e.eventDate} ·{' '}
                        {formatMins(start)} · {CATEGORY_LABEL[e.category]}
                      </span>
                    </span>
                  </button>
                )
              })}
          </div>
        )}
      </section>

      {/* Sharing */}
      <section className="mt-auto space-y-2.5 border-t border-slate-200 pt-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Share</h2>

        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={timetable.isShared}
            onChange={(e) => props.onToggleShare(e.target.checked)}
            className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          Anyone with the link can view
        </label>

        {timetable.isShared && shareUrl && (
          <div className="flex gap-2">
            <input
              readOnly
              value={shareUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-2 text-sm text-slate-600"
            />
            <button
              onClick={copyShare}
              className="shrink-0 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}

        <button
          onClick={props.onExportIcs}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Export to calendar (.ics)
        </button>

        {/* An image is what actually gets pasted into a group chat. */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">Save this week as</span>
          <button
            onClick={() => props.onExportImage('png')}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            PNG
          </button>
          <button
            onClick={() => props.onExportImage('jpeg')}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            JPG
          </button>
        </div>
      </section>

      <PeoplePanel
        follows={props.follows}
        visibleIds={props.visibleFollowIds}
        onToggleVisible={props.onToggleFollowVisible}
        onAdd={props.onAddFollow}
        onRemove={props.onRemoveFollow}
      />
      </aside>
    </>
  )
}
