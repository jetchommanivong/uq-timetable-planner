import type { CustomEvent, PickedClass } from '../types'
import { DAYS } from '../types'
import { categorySwatch, courseSwatch } from '../lib/colors'
import {
  addDays,
  formatDateLabel,
  formatMins,
  formatRange,
  gridBounds,
  layoutDay,
  occurrencesForWeek,
  toISO,
} from './schedule'

/**
 * Draws the week straight onto a canvas rather than screenshotting the DOM.
 *
 * A DOM-scraping library (html2canvas and friends) would add a dependency, be
 * at the mercy of whatever the layout is doing at that moment, and produce an
 * image sized to the user's viewport. Drawing it here gives a fixed, readable
 * output that looks the same on every machine.
 */

export interface ImageData {
  name: string
  subtitle?: string
  classes: PickedClass[]
  events: CustomEvent[]
  weekStart: Date
}

/** Minimal slice of the canvas API used here, so tests can pass a recorder. */
export type Ctx = Pick<
  CanvasRenderingContext2D,
  | 'fillRect'
  | 'fillText'
  | 'measureText'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'stroke'
  | 'save'
  | 'restore'
> & {
  fillStyle: string | CanvasGradient | CanvasPattern
  strokeStyle: string | CanvasGradient | CanvasPattern
  lineWidth: number
  font: string
  textBaseline: CanvasTextBaseline
  textAlign: CanvasTextAlign
}

const WIDTH = 1700
const PADDING = 40
const RAIL_W = 78
const HEADER_H = 96
const DAY_HEADER_H = 52
const FOOTER_H = 44
const PX_PER_MIN = 1.15
const MIN_BLOCK_H = 26

const FONT = (size: number, weight = '400') =>
  `${weight} ${size}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`

/** Shortens text with an ellipsis so it never bleeds out of its block. */
export function truncate(ctx: Ctx, text: string, maxWidth: number): string {
  if (!text) return ''
  if (ctx.measureText(text).width <= maxWidth) return text

  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return lo > 0 ? `${text.slice(0, lo)}…` : ''
}

/** Total canvas height needed for this week's contents. */
export function imageHeight(data: ImageData): number {
  const occurrences = occurrencesForWeek(data.classes, data.events, data.weekStart)
  const bounds = gridBounds(occurrences)
  return (
    HEADER_H +
    DAY_HEADER_H +
    (bounds.end - bounds.start) * PX_PER_MIN +
    FOOTER_H +
    PADDING * 2
  )
}

export function drawTimetable(ctx: Ctx, data: ImageData): { width: number; height: number } {
  const occurrences = occurrencesForWeek(data.classes, data.events, data.weekStart)
  const bounds = gridBounds(occurrences)
  const height = imageHeight(data)

  const gridTop = PADDING + HEADER_H + DAY_HEADER_H
  const gridLeft = PADDING + RAIL_W
  const gridRight = WIDTH - PADDING
  const colW = (gridRight - gridLeft) / 7
  const yOf = (mins: number) => gridTop + (mins - bounds.start) * PX_PER_MIN

  // Opaque background — JPEG has no alpha, and a transparent PNG would look
  // broken pasted into a chat.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, WIDTH, height)

  // ---- header ----
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#0f172a'
  ctx.font = FONT(34, '700')
  ctx.fillText(truncate(ctx, data.name, WIDTH - PADDING * 2), PADDING, PADDING + 36)

  const weekEnd = addDays(data.weekStart, 6)
  const range = `${formatDateLabel(toISO(data.weekStart))} – ${formatDateLabel(toISO(weekEnd))}`
  ctx.fillStyle = '#64748b'
  ctx.font = FONT(19)
  ctx.fillText(
    data.subtitle ? `${range}  ·  ${data.subtitle}` : range,
    PADDING,
    PADDING + 68,
  )

  // ---- day headers ----
  const todayISO = toISO(new Date())
  for (let i = 0; i < 7; i++) {
    const date = toISO(addDays(data.weekStart, i))
    const cx = gridLeft + colW * i + colW / 2
    const isToday = date === todayISO

    ctx.textAlign = 'center'
    ctx.fillStyle = isToday ? '#4f46e5' : '#334155'
    ctx.font = FONT(19, '600')
    ctx.fillText(DAYS[i], cx, gridTop - 22)

    ctx.fillStyle = isToday ? '#4f46e5' : '#94a3b8'
    ctx.font = FONT(16, isToday ? '600' : '400')
    ctx.fillText(String(Number(date.slice(8))), cx, gridTop - 2)
  }

  // ---- hour rail and horizontal rules ----
  ctx.textAlign = 'right'
  ctx.lineWidth = 1
  for (let m = bounds.start; m <= bounds.end; m += 60) {
    const y = yOf(m)

    ctx.strokeStyle = '#e2e8f0'
    ctx.beginPath()
    ctx.moveTo(gridLeft, y)
    ctx.lineTo(gridRight, y)
    ctx.stroke()

    if (m > bounds.start) {
      ctx.fillStyle = '#94a3b8'
      ctx.font = FONT(15, '500')
      ctx.fillText(formatMins(m), gridLeft - 14, y + 5)
    }
  }

  // ---- day column separators ----
  ctx.strokeStyle = '#e2e8f0'
  for (let i = 0; i <= 7; i++) {
    const x = gridLeft + colW * i
    ctx.beginPath()
    ctx.moveTo(x, gridTop)
    ctx.lineTo(x, yOf(bounds.end))
    ctx.stroke()
  }

  // ---- blocks ----
  for (let i = 0; i < 7; i++) {
    const day = DAYS[i]
    const positioned = layoutDay(occurrences.filter((o) => o.day === day))

    for (const o of positioned) {
      const swatch =
        o.kind === 'class' ? courseSwatch(o.title) : categorySwatch(o.category ?? 'other')

      const slotW = colW / o.columnCount
      const x = gridLeft + colW * i + slotW * o.column + 3
      const w = slotW - 6
      const y = yOf(o.startMins) + 1
      const h = Math.max((o.endMins - o.startMins) * PX_PER_MIN - 2, MIN_BLOCK_H)

      ctx.fillStyle = swatch.bg
      ctx.fillRect(x, y, w, h)

      // Left accent bar, matching the on-screen blocks.
      ctx.fillStyle = swatch.border
      ctx.fillRect(x, y, 4, h)

      const textX = x + 12
      const textW = w - 18
      ctx.textAlign = 'left'
      ctx.fillStyle = swatch.text

      ctx.font = FONT(15, '700')
      ctx.fillText(truncate(ctx, o.title, textW), textX, y + 19)

      if (h >= 46) {
        ctx.font = FONT(13)
        ctx.fillText(truncate(ctx, o.subtitle, textW), textX, y + 36)
      }
      if (h >= 64) {
        ctx.font = FONT(13)
        ctx.fillText(
          truncate(ctx, formatRange(o.startMins, o.endMins), textW),
          textX,
          y + 53,
        )
      }
      if (h >= 82 && o.location) {
        ctx.font = FONT(12)
        ctx.fillText(truncate(ctx, o.location, textW), textX, y + 70)
      }
    }
  }

  // ---- footer ----
  ctx.textAlign = 'left'
  ctx.fillStyle = '#94a3b8'
  ctx.font = FONT(14)
  ctx.fillText('Made with UQ Timetable Planner', PADDING, height - PADDING + 10)

  return { width: WIDTH, height }
}

/** Renders the week and hands back an image blob ready to download. */
export async function exportTimetableImage(
  data: ImageData,
  format: 'png' | 'jpeg',
  scale = 2,
): Promise<Blob> {
  const height = imageHeight(data)
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH * scale
  canvas.height = height * scale

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get a drawing context for the image')

  // Draw at logical size and let the transform handle the retina multiplier.
  ctx.scale(scale, scale)
  drawTimetable(ctx as unknown as Ctx, data)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The image could not be generated'))),
      format === 'png' ? 'image/png' : 'image/jpeg',
      0.92,
    )
  })
}
