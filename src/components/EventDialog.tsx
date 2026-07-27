import { useState } from 'react'
import type { Category, CustomEvent, Day } from '../types'
import { CATEGORIES, DAYS } from '../types'
import { CATEGORY_LABEL, categorySwatch } from '../lib/colors'
import { formatDuration, minutesOf, toClock, toISO } from '../lib/schedule'

interface Props {
  /** Prefills the form. Present for both editing and duplicating. */
  initial: CustomEvent | null
  /** False when `initial` is only a template being copied from. */
  isEditing: boolean
  onSave: (body: Record<string, unknown>) => Promise<void>
  onDelete?: () => Promise<void>
  onDuplicate?: () => void
  onClose: () => void
}

export function EventDialog({ initial, isEditing, onSave, onDelete, onDuplicate, onClose }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [category, setCategory] = useState<Category>(initial?.category ?? 'work')
  const [recurrence, setRecurrence] = useState<'weekly' | 'once'>(initial?.recurrence ?? 'weekly')
  // A shift at the same place usually repeats on several days, so days are a
  // set: pick Mon/Wed/Fri once instead of retyping the whole event three times.
  const [daysOfWeek, setDaysOfWeek] = useState<Day[]>(
    initial?.dayOfWeek ? [initial.dayOfWeek] : ['Mon'],
  )

  function toggleDay(d: Day) {
    setDaysOfWeek((prev) =>
      prev.includes(d) ? (prev.length > 1 ? prev.filter((x) => x !== d) : prev) : [...prev, d],
    )
  }
  const [eventDate, setEventDate] = useState(initial?.eventDate ?? toISO(new Date()))
  const [startTime, setStartTime] = useState(initial?.startTime ?? '17:00')
  const [endTime, setEndTime] = useState(
    toClock(minutesOf(initial?.startTime ?? '17:00') + (initial?.durationMins ?? 180)),
  )
  const [location, setLocation] = useState(initial?.location ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const durationMins = minutesOf(endTime) - minutesOf(startTime)

  /** Dragging the start time carries the end with it, keeping the length intact. */
  function changeStart(next: string) {
    const shift = minutesOf(next) - minutesOf(startTime)
    setStartTime(next)
    setEndTime(toClock(minutesOf(endTime) + shift))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (durationMins <= 0) {
      setError(
        'The end time has to be after the start time. Events running past midnight aren’t supported yet — add them as two events.',
      )
      return
    }

    setBusy(true)
    try {
      await onSave({
        title,
        category,
        recurrence,
        daysOfWeek: recurrence === 'weekly' ? daysOfWeek : null,
        eventDate: recurrence === 'once' ? eventDate : null,
        startTime,
        durationMins,
        location: location || null,
        notes: notes || null,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
      >
        <h2 className="mb-5 text-xl font-semibold text-slate-900">
          {isEditing ? 'Edit event' : initial ? 'Duplicate event' : 'Add to your week'}
        </h2>

        <div className="space-y-4">
          <Field label="What is it?">
            <input
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Shift at the coffee shop"
              required
              autoFocus
            />
          </Field>

          <Field label="Category">
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => {
                const sw = categorySwatch(c)
                const active = category === c
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                      active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: sw.dot }} />
                    {CATEGORY_LABEL[c]}
                  </button>
                )
              })}
            </div>
          </Field>

          <Field label="Repeats">
            <div className="flex rounded-lg bg-slate-100 p-1 text-sm font-medium">
              {(
                [
                  ['weekly', 'Every week'],
                  ['once', 'Just once'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRecurrence(value)}
                  className={`flex-1 rounded-md px-3 py-2 text-sm transition ${
                    recurrence === value
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>

          {recurrence === 'weekly' ? (
            <Field label="Which days?">
              <div className="grid grid-cols-7 gap-1">
                {DAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={daysOfWeek.includes(d)}
                    onClick={() => toggleDay(d)}
                    className={`rounded-md border px-1 py-2 text-sm font-medium transition ${
                      daysOfWeek.includes(d)
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-sm text-slate-500">
                {daysOfWeek.length > 1
                  ? `Creates ${daysOfWeek.length} weekly events — one per day, each editable on its own.`
                  : 'Pick more than one day to repeat this across the week.'}
              </p>
            </Field>
          ) : (
            <Field label="Date">
              <input
                type="date"
                className={inputClass}
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                required
              />
            </Field>
          )}

          <div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts">
                <input
                  type="time"
                  className={inputClass}
                  value={startTime}
                  onChange={(e) => changeStart(e.target.value)}
                  required
                />
              </Field>
              <Field label="Ends">
                <input
                  type="time"
                  className={inputClass}
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                />
              </Field>
            </div>
            <p
              className={`mt-1.5 text-sm ${
                durationMins > 0 ? 'text-slate-500' : 'font-medium text-red-600'
              }`}
            >
              {durationMins > 0
                ? `That's ${formatDuration(durationMins)}.`
                : 'End time must be after the start time.'}
            </p>
          </div>

          <Field label="Where (optional)">
            <input
              className={inputClass}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Toowong"
            />
          </Field>

          <Field label="Notes (optional)">
            <textarea
              className={`${inputClass} resize-none`}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}

        <div className="mt-6 flex items-center gap-2">
          <button
            type="submit"
            disabled={busy}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-base font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          {isEditing && onDuplicate && (
            <button
              type="button"
              onClick={onDuplicate}
              title="Make a copy with the same title and details"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Duplicate
            </button>
          )}
          {isEditing && onDelete && (
            <button
              type="button"
              onClick={async () => {
                setBusy(true)
                try {
                  await onDelete()
                  onClose()
                } finally {
                  setBusy(false)
                }
              }}
              className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              Delete
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  )
}
