import { describe, expect, it } from 'vitest'
import { drawTimetable, imageHeight, truncate, type Ctx } from './lib/exportImage'
import { fromISO, mondayOf } from './lib/schedule'
import type { CustomEvent, PickedClass } from './types'

/**
 * jsdom has no real canvas, so these drive the drawing code with a recorder and
 * assert on what it tried to paint. That covers the layout and labelling logic;
 * the pixels themselves are the browser's job.
 */
function recorder() {
  const texts: { text: string; x: number; y: number }[] = []
  const rects: { x: number; y: number; w: number; h: number; fill: string }[] = []

  const ctx = {
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '',
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    textAlign: 'left' as CanvasTextAlign,
    fillRect: (x: number, y: number, w: number, h: number) =>
      rects.push({ x, y, w, h, fill: String(ctx.fillStyle) }),
    fillText: (text: string, x: number, y: number) => texts.push({ text, x, y }),
    // Rough proportional-width estimate; good enough to exercise truncation.
    measureText: (t: string) => ({ width: t.length * 7 }) as TextMetrics,
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    save: () => {},
    restore: () => {},
  }

  return { ctx: ctx as unknown as Ctx, texts, rects }
}

const WEEK = mondayOf(fromISO('2026-02-23'))

const cls: PickedClass = {
  id: 1,
  subjectCode: 'CSSE2310_S1',
  callistaCode: 'CSSE2310',
  description: 'Computer Systems',
  semester: 'S1',
  campus: 'STLUCIA',
  activityGroupCode: 'LEC01',
  activityCode: '01',
  activityType: 'Lecture',
  dayOfWeek: 'Mon',
  startTime: '12:00',
  durationMins: 120,
  location: '50-T203 - Hawken',
  staff: '',
  color: null,
  dates: ['2026-02-23'],
}

const shift: CustomEvent = {
  id: 1,
  title: 'Cafe shift',
  category: 'work',
  recurrence: 'weekly',
  dayOfWeek: 'Thu',
  eventDate: null,
  startTime: '17:00',
  durationMins: 300,
  location: 'Toowong',
  notes: null,
  color: null,
}

describe('image export', () => {
  it('draws a title, the week range and every block', () => {
    const { ctx, texts } = recorder()
    drawTimetable(ctx, {
      name: 'My timetable',
      subtitle: "Alex's timetable",
      classes: [cls],
      events: [shift],
      weekStart: WEEK,
    })

    const all = texts.map((t) => t.text)
    expect(all).toContain('My timetable')
    expect(all.some((t) => t.includes('23 Feb') && t.includes('1 Mar'))).toBe(true)
    expect(all.some((t) => t.includes("Alex's timetable"))).toBe(true)

    // Both entries are labelled.
    expect(all).toContain('CSSE2310')
    expect(all).toContain('Cafe shift')

    // Every weekday column is headed.
    for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) expect(all).toContain(d)

    expect(all).toContain('Made with UQ Timetable Planner')
  })

  it('paints an opaque background so JPEG export is not black', () => {
    const { ctx, rects } = recorder()
    drawTimetable(ctx, { name: 'T', classes: [], events: [], weekStart: WEEK })

    expect(rects[0]).toMatchObject({ x: 0, y: 0, fill: '#ffffff' })
  })

  it('places a block at the right vertical offset for its start time', () => {
    const { ctx, texts } = recorder()
    drawTimetable(ctx, { name: 'T', classes: [cls], events: [], weekStart: WEEK })

    const noon = texts.find((t) => t.text === 'CSSE2310')!
    const nine = texts.find((t) => t.text === '9am')!
    // A midday class sits below the 9am rule.
    expect(noon.y).toBeGreaterThan(nine.y)
  })

  it('grows the canvas when events fall outside normal hours', () => {
    const base = imageHeight({ name: 'T', classes: [], events: [], weekStart: WEEK })
    const late = imageHeight({
      name: 'T',
      classes: [],
      events: [{ ...shift, startTime: '22:00', durationMins: 90 }],
      weekStart: WEEK,
    })
    expect(late).toBeGreaterThan(base)
  })

  it('truncates text that would overflow its block', () => {
    const { ctx } = recorder()
    expect(truncate(ctx, 'short', 1000)).toBe('short')

    const long = truncate(ctx, 'A very long building name that will not fit', 70)
    expect(long.endsWith('…')).toBe(true)
    expect(long.length).toBeLessThan(43)
  })
})
