import { useMemo, useState } from 'react'
import type { CustomEvent, Day, Occurrence, PickedClass } from '../types'
import { DAYS } from '../types'
import { categorySwatch, courseSwatch, personSwatch, type Swatch } from '../lib/colors'
import {
  addDays,
  findClashes,
  formatMins,
  formatRange,
  gridBounds,
  layoutDay,
  railSegments,
  taggedOccurrences,
  toISO,
  type RailSegment,
} from '../lib/schedule'

const PX_PER_MIN = 1.35

// Followed timetables live in narrow rails down the right of each day rather
// than sharing columns with your own blocks. Splitting the column evenly meant
// one friend halved your classes and three quartered them, which made your own
// timetable — the thing you actually came to read — the least legible part of
// the screen.
const RAIL_GAP = 2

/** Roughly a hover card's height — below this, cards grow upwards instead. */
const CARD_CLEARANCE = 180

/** Rails thin out past a few people so the day never loses more than ~44px. */
function railWidth(peopleCount: number): number {
  if (peopleCount === 0) return 0
  if (peopleCount <= 2) return 14
  if (peopleCount <= 4) return 10
  return 7
}

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
  const own = useMemo(
    () => taggedOccurrences(classes, events, weekStart),
    [classes, events, weekStart],
  )

  /** One rail per followed person, with their colour and this week's blocks. */
  const people = useMemo(
    () =>
      overlays.map((p) => ({
        ...p,
        swatch: personSwatch(p.key),
        occurrences: taggedOccurrences(p.classes, p.events, weekStart, {
          key: p.key,
          name: p.name,
        }),
      })),
    [overlays, weekStart],
  )

  const occurrences = useMemo(
    () => [...own, ...people.flatMap((p) => p.occurrences)],
    [own, people],
  )
  const clashes = useMemo(() => findClashes(own), [own])
  // Bounds span everyone, so a friend's 8am never falls off the top of the grid.
  const bounds = useMemo(() => gridBounds(occurrences), [occurrences])
  // Which days have anything on them, so the mobile tabs can hint at it.
  const daysWithOccurrences = useMemo(() => new Set(occurrences.map((o) => o.day)), [occurrences])

  const railW = railWidth(people.length)
  const railsWidth = people.length ? people.length * (railW + RAIL_GAP) + RAIL_GAP : 0

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
      {/* Names the rails. Without it the coloured stripes are unreadable, since
          the People list that explains them lives in the sidebar. */}
      {people.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200 bg-slate-50/80 px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Also showing
          </span>
          {people.map((p) => (
            <span key={p.key} className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: p.swatch.dot }}
                aria-hidden
              />
              {p.name}
            </span>
          ))}
          <span className="ml-auto hidden text-xs text-slate-400 sm:block">
            Hover a stripe for details
          </span>
        </div>
      )}

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
            const dayOccurrences = layoutDay(own.filter((o) => o.day === day))
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

                {/* Your own blocks own everything the rails don't take. */}
                <div className="absolute inset-y-0 left-0" style={{ right: railsWidth }}>
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

                {/* The gutter is tinted so a stripe reads as part of this day
                    rather than floating against the next day's border. */}
                {people.length > 0 && (
                  <div
                    className="absolute inset-y-0 right-0 flex border-l border-slate-200/70 bg-slate-50/70"
                    style={{ width: railsWidth, gap: RAIL_GAP, paddingRight: RAIL_GAP }}
                  >
                    {people.map((p) => (
                      <div key={p.key} className="relative h-full" style={{ width: railW }}>
                        {railSegments(p.occurrences.filter((o) => o.day === day)).map((seg) => {
                          const segTop = (seg.startMins - bounds.start) * PX_PER_MIN
                          return (
                            <Rail
                              key={seg.key}
                              segment={seg}
                              personName={p.name}
                              swatch={p.swatch}
                              top={segTop}
                              height={Math.max((seg.endMins - seg.startMins) * PX_PER_MIN, 10)}
                              openRight={i <= 2}
                              alignBottom={segTop > height - CARD_CLEARANCE}
                            />
                          )
                        })}
                      </div>
                    ))}
                  </div>
                )}
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

interface RailProps {
  segment: RailSegment
  personName: string
  swatch: Swatch
  top: number
  height: number
  /** Open the card rightwards; set for the leftmost desktop columns. */
  openRight: boolean
  /** Grow the card upwards, for stripes near the bottom of the grid. */
  alignBottom: boolean
}

/**
 * One stripe of a followed person's day. Too narrow for text by design — the
 * detail lives in a card that opens on hover or keyboard focus.
 *
 * The card is nested inside two clipping ancestors, so it has to open towards
 * the middle of the grid: leftwards from the later columns, rightwards from the
 * first few, and upwards from stripes low enough that it would overrun the
 * bottom. Below `md` a single full-width day renders, so leftwards always fits.
 */
function Rail({ segment, personName, swatch, top, height, openRight, alignBottom }: RailProps) {
  // One class needs no "busy 9–10, containing: 9–10" preamble; several do.
  const label =
    segment.parts.length === 1
      ? `${personName} · ${segment.parts[0].title} ${segment.parts[0].subtitle}, ${formatRange(segment.startMins, segment.endMins)}`
      : `${personName} · busy ${formatRange(segment.startMins, segment.endMins)}: ${segment.parts
          .map((p) => `${p.title} ${formatRange(p.startMins, p.endMins)}`)
          .join(', ')}`

  return (
    <div
      className="group absolute inset-x-0"
      style={{ top, height }}
      tabIndex={0}
      role="button"
      aria-label={label}
    >
      <div
        className="h-full w-full rounded-[3px] opacity-75 transition group-hover:opacity-100 group-focus-visible:opacity-100"
        style={{ background: swatch.dot }}
      >
        {/* Hairlines where one commitment ends and the next begins, so a merged
            stripe still shows it is more than a single class. */}
        {segment.parts.slice(1).map((p) => (
          <div
            key={p.key}
            className="absolute inset-x-0 border-t border-white/60"
            style={{ top: (p.startMins - segment.startMins) * PX_PER_MIN }}
          />
        ))}
      </div>

      <div
        className={`pointer-events-none absolute right-full z-40 mr-1.5 hidden w-52 rounded-lg border border-slate-200 bg-white p-2.5 text-left shadow-lg group-hover:block group-focus-within:block ${
          alignBottom ? 'bottom-0' : 'top-0'
        } ${openRight ? 'md:left-full md:right-auto md:ml-1.5 md:mr-0' : ''}`}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ background: swatch.dot }}
            aria-hidden
          />
          <span className="truncate text-xs font-semibold text-slate-900">{personName}</span>
          <span className="ml-auto shrink-0 text-[11px] text-slate-400">
            {formatMins(segment.startMins)}–{formatMins(segment.endMins)}
          </span>
        </div>
        <ul className="mt-1.5 space-y-1.5">
          {segment.parts.map((p) => (
            <li key={p.key} className="border-l-2 pl-2" style={{ borderColor: swatch.border }}>
              <div className="truncate text-xs font-medium text-slate-800">{p.title}</div>
              <div className="truncate text-[11px] text-slate-500">
                {formatRange(p.startMins, p.endMins)} · {p.subtitle}
              </div>
              {p.location && (
                <div className="truncate text-[11px] text-slate-400">{p.location}</div>
              )}
            </li>
          ))}
        </ul>
      </div>
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
  // Only your own occurrences reach here; followed people render as rails.
  const swatch = o.kind === 'class' ? courseSwatch(o.title) : categorySwatch(o.category ?? 'other')

  const widthPct = 100 / o.columnCount
  const compact = height < 56

  const clickable = !readOnly && (o.kind === 'event' ? !!onSelectEvent : !!onRemoveClass)

  function handleClick() {
    if (readOnly) return
    if (o.kind === 'event' && o.eventRef) onSelectEvent?.(o.eventRef)
    if (o.kind === 'class' && o.classRef) onRemoveClass?.(o.classRef)
  }

  const subtitle = o.subtitle

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
