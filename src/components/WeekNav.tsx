import type { PickedClass } from '../types'
import { addDays, formatDateLabel, mondayOf, semesterRange, toISO } from '../lib/schedule'

interface Props {
  weekStart: Date
  onChange: (d: Date) => void
  classes: PickedClass[]
}

export function WeekNav({ weekStart, onChange, classes }: Props) {
  const weekEnd = addDays(weekStart, 6)
  const range = semesterRange(classes)

  // If the classes span a known teaching period, show which week of it we're in.
  let weekLabel: string | null = null
  if (range) {
    const first = mondayOf(new Date(range.first + 'T00:00:00'))
    const diff = Math.round((weekStart.getTime() - first.getTime()) / (7 * 86_400_000))
    const total =
      Math.round(
        (mondayOf(new Date(range.last + 'T00:00:00')).getTime() - first.getTime()) /
          (7 * 86_400_000),
      ) + 1
    if (diff >= 0 && diff < total) weekLabel = `Week ${diff + 1} of ${total}`
  }

  const isThisWeek = toISO(weekStart) === toISO(mondayOf(new Date()))

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(addDays(weekStart, -7))}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-600 hover:bg-slate-50"
          aria-label="Previous week"
        >
          ‹
        </button>
        <button
          onClick={() => onChange(mondayOf(new Date()))}
          disabled={isThisWeek}
          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          Today
        </button>
        <button
          onClick={() => onChange(addDays(weekStart, 7))}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-600 hover:bg-slate-50"
          aria-label="Next week"
        >
          ›
        </button>
      </div>

      <div className="min-w-0">
        <div className="text-base font-semibold text-slate-900">
          {formatDateLabel(toISO(weekStart))} – {formatDateLabel(toISO(weekEnd))}
        </div>
        {weekLabel && <div className="text-sm text-slate-500">{weekLabel}</div>}
      </div>
    </div>
  )
}
