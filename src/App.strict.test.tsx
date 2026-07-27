import { StrictMode } from 'react'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

/**
 * Same DECO3500 flow as App.test.tsx, but faithful to how the app actually
 * runs: wrapped in StrictMode (as main.tsx does) and with real async gaps
 * between request and response, so any state race has room to show up.
 */

const activity = (group: string, day: string, time: string) => ({
  id: `DECO3500_S2|${group}|01`,
  subjectCode: 'DECO3500_S2',
  activityGroupCode: group,
  activityCode: '01',
  activityType: 'Studio',
  dayOfWeek: day,
  startTime: time,
  durationMins: 180,
  location: 'Somewhere',
  staff: '',
  campus: 'St Lucia',
  availability: 5,
  selectable: 'available',
  color: null,
  dates: ['2026-07-28'],
  isRecording: false,
})

const COURSE = {
  subjectCode: 'DECO3500_S2',
  callistaCode: 'DECO3500',
  description: 'Social and Mobile Computing',
  semester: 'S2',
  campus: 'STLUCIA',
  manager: '',
  groups: [
    { code: 'STU01', type: 'Studio', options: [activity('STU01', 'Tue', '11:00')] },
    { code: 'STU02', type: 'Studio', options: [activity('STU02', 'Thu', '14:00')] },
  ],
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function mockServer() {
  let classes: any[] = []
  let nextId = 1

  return vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(init.body as string) : null

    // Real requests are not instantaneous; give React time to re-render
    // in between, which is where an ordering bug would surface.
    await sleep(15)

    const timetable = () => ({
      id: 1, userId: 1, name: 'My timetable', shareToken: null, isShared: false,
      createdAt: '', updatedAt: '', classes, events: [],
    })
    const json = (data: unknown, status = 200) =>
      ({ ok: status < 400, status, text: async () => JSON.stringify(data) }) as Response

    if (url === '/api/auth/me') return json({ user: { id: 1, email: 'a@b.c', displayName: 'Test' } })
    if (url === '/api/timetables' && method === 'GET')
      return json({ timetables: [{ id: 1, name: 'My timetable', shareToken: null, isShared: false, updatedAt: '', classCount: classes.length, eventCount: 0 }] })
    if (url === '/api/timetables/1' && method === 'GET') return json({ timetable: timetable() })
    if (url.startsWith('/api/uq/search')) return json({ courses: [COURSE] })
    if (url === '/api/timetables/1/classes' && method === 'POST') {
      classes = classes.filter(
        (c) => !(c.subjectCode === body.subjectCode && c.activityGroupCode === body.activityGroupCode),
      )
      classes.push({ ...body, id: nextId++ })
      return json({ timetable: timetable() }, 201)
    }
    throw new Error(`unexpected request: ${method} ${url}`)
  })
}

describe('StrictMode + latency', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockServer())
    window.history.pushState({}, '', '/')
  })

  it('search dialog survives picking a class', async () => {
    const user = userEvent.setup()
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await screen.findByText('UQ Timetable Planner')
    await user.click(await screen.findByText(/Add a class/i))
    await user.type(await screen.findByPlaceholderText(/Search a course code/i), 'DECO3500')

    const studio1 = await screen.findByRole('heading', { name: /Studio 1/i })
    await user.click(within(studio1.parentElement!).getByRole('button', { name: /Tue/i }))

    await waitFor(() => expect(screen.getByText('1 of 2 added')).toBeDefined())

    // The dialog must still be mounted and usable.
    expect(screen.queryByPlaceholderText(/Search a course code/i)).not.toBeNull()
    expect(screen.queryByRole('heading', { name: /Studio 2/i })).not.toBeNull()
  })
})
