import { useMemo, useState } from 'react'
import type { CustomEvent, Day, Occurrence, PickedClass } from '../types'
import { DAYS } from '../types'
import { categorySwatch, courseSwatch, personSwatch } from '../lib/colors'
import {
  addDays,
  findClashes,
  formatMins,
  formatRange,
  gridBounds,
  layoutDay,
  taggedOccurrences,
  toISO,
} from '../lib/schedule'

const PX_PER_MIN = 1.35

/** Today's weekday, in the same Mon-first order as `DAYS`. */
function todaysDay(): Day {
  return DAYS[(new Date().getDay() + 6) % 7]
}

/** A followed person's schedule, overlaid read-only on the viewer's own grid. */
export interface OverlayPerson {
  key: string
  name: string
  classes: PickedClass[]
  events: CustomEvent[]
}

interface Props {
  classes: PickedClass[]
  events: CustomEvent[]
  weekStart: Date
  readOnly?: boolean
  overlays?: OverlayPerson[]
  onSelectEvent?: (event: CustomEvent) => void
  onRemoveClass?: (cls: PickedClass) => void
}

export function WeekGrid({
  classes,
  events,
  weekStart,
  readOnly = false,
  overlays = [],
  onSelectEvent,
  onRemoveClass,
}: Props) {
  const occurrences = useMemo(() => {
    const own = taggedOccurrences(classes, events, weekStart)
    const others = overlays.flatMap((p) =>
      taggedOccurrences(p.classes, p.events, weekStart, { key: p.key, name: p.name }),
    )
    return [...own, ...others]
  }, [classes, events, weekStart, overlays])
  const clashes = useMemo(() => findClashes(occurrences), [occurrences])
  const bounds = useMemo(() => gridBounds(occurrences), [occurrences])
  // Which days have anything on them, so the mobile tabs can hint at it.
  const daysWithOccurrences = useMemo(() => new Set(occurrences.map((o) => o.day)), [occurrences])

  // Below `md` only one day renders at a time; persists across week
  // navigation rather than resetting, since staying on "Wednesday" when you
  // flip to next week is more useful than snapping back to today's weekday.
  const [mobileDay, setMobileDay] = useState<Day>(todaysDay)

  const todayISO = toISO(new Date())
  const hours: number[] = []
  for (let m = bounds.start; m <= bounds.end; m += 60) hours.push(m)

  const height = (bounds.end - bounds.start) * PX_PER_MIN

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      {/* Mobile-only day switcher, replacing the 7-wide header below `md`. */}
      <div className="flex gap-1 border-b border-slate-200 bg-slate-50/80 p-1.5 md:hidden">
        {DAYS.map((day, i) => {
          const date = toISO(addDays(weekStart, i))
          const isToday = date === todayISO
          const isSelected = day === mobileDay
          return (
            <button
              key={day}
              onClick={() => setMobileDay(day)}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-xs font-semibold transition ${
                isSelected
                  ? 'bg-indigo-600 text-white'
                  : isToday
                    ? 'text-indigo-600 ring-1 ring-inset ring-indigo-200'
                    : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>{day}</span>
              <span className="text-[11px] font-normal opacity-80">{Number(date.slice(8))}</span>
              <span
                className={`h-1 w-1 rounded-full ${
                  daysWithOccurrences.has(day) ? (isSelected ? 'bg-white' : 'bg-indigo-400') : 'bg-transparent'
                }`}
              />
            </button>
          )
        })}
      </div>

      {/* Day headers stay put while the times scroll. Desktop only — mobile uses the tab strip above. */}
      <div className="hidden border-b border-slate-200 bg-slate-50/80 pr-[10px] md:flex">
        <div className="w-16 shrink-0" />
        {DAYS.map((day, i) => {
          const date = toISO(addDays(weekStart, i))
          const isToday = date === todayISO
          return (
            <div key={day} className="flex-1 border-l border-slate-200 px-2 py-2 text-center">
              <div
                className={`text-sm font-semibold ${isToday ? 'text-indigo-600' : 'text-slate-600'}`}
              >
                {day}
              </div>
              <div
                className={`mt-1 text-sm ${
                  isToday
                    ? 'mx-auto w-7 rounded-full bg-indigo-600 py-0.5 font-semibold text-white'
                    : 'text-slate-400'
                }`}
              >
                {Number(date.slice(8))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="thin-scroll flex-1 overflow-y-auto">
        <div className="relative flex" style={{ height }}>
          {/* Hour rail */}
          <div className="relative w-16 shrink-0">
            {hours.map((m) => (
              <div
                key={m}
                className="absolute right-2 -translate-y-1/2 text-xs font-medium text-slate-400"
                style={{ top: (m - bounds.start) * PX_PER_MIN }}
              >
                {m === bounds.start ? '' : formatMins(m)}
              </div>
            ))}
          </div>

          {DAYS.map((day, i) => {
            const date = toISO(addDays(weekStart, i))
            const dayOccurrences = layoutDay(occurrences.filter((o) => o.day === day))
            return (
              <div
                key={day}
                className={`relative flex-1 border-l border-slate-200 md:block ${
                  day === mobileDay ? '' : 'hidden'
                }`}
              >
                {hours.map((m) => (
                  <div
                    key={m}
                    className="absolute inset-x-0 border-t border-slate-100"
                    style={{ top: (m - bounds.start) * PX_PER_MIN }}
                  />
                ))}

                {date === todayISO && <NowLine bounds={bounds} />}

                {dayOccurrences.map((o) => (
                  <Block
                    key={o.key}
                    occurrence={o}
                    top={(o.startMins - bounds.start) * PX_PER_MIN}
                    height={Math.max((o.endMins - o.startMins) * PX_PER_MIN, 22)}
                    clashing={clashes.has(o.key)}
                    readOnly={readOnly}
                    onSelectEvent={onSelectEvent}
                    onRemoveClass={onRemoveClass}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function NowLine({ bounds }: { bounds: { start: number; end: number } }) {
  const now = new Date()
  const mins = now.getHours() * 60 + now.getMinutes()
  if (mins < bounds.start || mins > bounds.end) return null
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-red-500"
      style={{ top: (mins - bounds.start) * PX_PER_MIN }}
    >
      <div className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-red-500" />
    </div>
  )
}

interface BlockProps {
  occurrence: ReturnType<typeof layoutDay>[number]
  top: number
  height: number
  clashing: boolean
  readOnly: boolean
  onSelectEvent?: (event: CustomEvent) => void
  onRemoveClass?: (cls: PickedClass) => void
}

function Block({
  occurrence: o,
  top,
  height,
  clashing,
  readOnly,
  onSelectEvent,
  onRemoveClass,
}: BlockProps) {
  const swatch = o.person
    ? personSwatch(o.person.key)
    : o.kind === 'class'
      ? courseSwatch(o.title)
      : categorySwatch(o.category ?? 'other')

  const widthPct = 100 / o.columnCount
  const compact = height < 56

  // Overlay blocks belong to someone else's timetable — never clickable.
  const clickable = !readOnly && !o.person && (o.kind === 'event' ? !!onSelectEvent : !!onRemoveClass)

  function handleClick() {
    if (readOnly || o.person) return
    if (o.kind === 'event' && o.eventRef) onSelectEvent?.(o.eventRef)
    if (o.kind === 'class' && o.classRef) onRemoveClass?.(o.classRef)
  }

  const subtitle = o.person ? `${o.person.name} · ${o.subtitle}` : o.subtitle

  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (clickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          handleClick()
        }
      }}
      title={`${o.title} · ${subtitle}\n${formatRange(o.startMins, o.endMins)}${
        o.location ? `\n${o.location}` : ''
      }`}
      className={`absolute overflow-hidden rounded-md border-l-[3px] px-2 py-1.5 text-left shadow-sm transition ${
        clickable ? 'cursor-pointer hover:z-30 hover:shadow-md' : ''
      } ${clashing ? 'ring-2 ring-red-500' : ''}`}
      style={{
        top,
        height,
        left: `calc(${o.column * widthPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        background: swatch.bg,
        borderLeftColor: swatch.border,
        color: swatch.text,
      }}
    >
      <div className="truncate text-sm font-semibold leading-tight">{o.title}</div>
      {!compact && (
        <>
          <div className="truncate text-xs leading-tight opacity-80">{subtitle}</div>
          <div className="truncate text-xs leading-tight opacity-70">
            {formatRange(o.startMins, o.endMins)}
          </div>
          {height > 84 && o.location && (
            <div className="truncate text-xs leading-tight opacity-60">{o.location}</div>
          )}
        </>
      )}
    </div>
  )
}

export type { Occurrence }
