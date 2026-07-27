import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

/**
 * Reproduces the DECO3500 flow: a course with two separate studio groups that
 * you attend both of. Picking the first must not close the search or discard
 * the second.
 */

const DECO_ACTIVITY = (group: string, day: string, time: string, loc: string) => ({
  id: `DECO3500_S2|${group}|01`,
  subjectCode: 'DECO3500_S2',
  activityGroupCode: group,
  activityCode: '01',
  activityType: 'Studio',
  dayOfWeek: day,
  startTime: time,
  durationMins: 180,
  location: loc,
  staff: '',
  campus: 'St Lucia',
  availability: 5,
  selectable: 'available',
  color: null,
  dates: ['2026-07-28', '2026-08-04'],
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
    { code: 'STU01', type: 'Studio', options: [DECO_ACTIVITY('STU01', 'Tue', '11:00', 'Adv Eng')] },
    { code: 'STU02', type: 'Studio', options: [DECO_ACTIVITY('STU02', 'Thu', '14:00', 'ModWest')] },
  ],
}

/** In-memory stand-in for the API, mirroring the real server's semantics. */
function mockServer() {
  let classes: any[] = []
  let nextId = 1

  return vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(init.body as string) : null
    const timetable = () => ({
      id: 1,
      userId: 1,
      name: 'My timetable',
      shareToken: null,
      isShared: false,
      createdAt: '',
      updatedAt: '',
      classes,
      events: [],
    })

    const json = (data: unknown, status = 200) =>
      ({ ok: status < 400, status, text: async () => JSON.stringify(data) }) as Response

    if (url === '/api/auth/me') return json({ user: { id: 1, email: 'a@b.c', displayName: 'Test' } })
    if (url === '/api/timetables' && method === 'GET')
      return json({ timetables: [{ id: 1, name: 'My timetable', shareToken: null, isShared: false, updatedAt: '', classCount: classes.length, eventCount: 0 }] })
    if (url === '/api/timetables/1' && method === 'GET') return json({ timetable: timetable() })
    if (url.startsWith('/api/uq/search')) return json({ courses: [COURSE] })

    if (url === '/api/timetables/1/classes' && method === 'POST') {
      // Same rule as the server: one option per group, so re-picking within a
      // group replaces, but a different group is additive.
      classes = classes.filter(
        (c) => !(c.subjectCode === body.subjectCode && c.activityGroupCode === body.activityGroupCode),
      )
      classes.push({ ...body, id: nextId++ })
      return json({ timetable: timetable() }, 201)
    }

    throw new Error(`unexpected request: ${method} ${url}`)
  })
}

describe('picking multiple activity groups', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockServer())
    window.history.pushState({}, '', '/')
  })

  it('keeps the search open and retains both studios', async () => {
    const user = userEvent.setup()
    render(<App />)

    await screen.findByText('UQ Timetable Planner')
    await user.click(await screen.findByText(/Add a class/i))

    const search = await screen.findByPlaceholderText(/Search a course code/i)
    await user.type(search, 'DECO3500')

    // Course auto-expands because it is the only result.
    const studio1 = await screen.findByRole('heading', { name: /Studio 1/i })
    const studio2 = await screen.findByRole('heading', { name: /Studio 2/i })
    expect(studio1).toBeDefined()
    expect(studio2).toBeDefined()

    expect(await screen.findByText('0 of 2 added')).toBeDefined()

    // Click the option under the "Studio 1" heading.
    const group1 = studio1.parentElement!
    await user.click(within(group1).getByRole('button', { name: /Tue/i }))

    // THE BUG UNDER TEST: the dialog must still be open afterwards.
    await waitFor(() => expect(screen.getByText('1 of 2 added')).toBeDefined())
    expect(screen.queryByPlaceholderText(/Search a course code/i)).not.toBeNull()

    // And it must say out loud that a second group is still outstanding,
    // rather than silently letting the user click Done.
    expect(screen.getByText(/still needs/i).textContent).toMatch(/1 of 2/)

    // And the second studio must still be pickable.
    const group2 = screen.getByRole('heading', { name: /Studio 2/i }).parentElement!
    await user.click(within(group2).getByRole('button', { name: /Thu/i }))

    await waitFor(() => expect(screen.getByText('2 of 2 added')).toBeDefined())

    await user.click(screen.getByText('Done'))

    // Both studios should now be on the timetable, distinctly labelled.
    // Each appears twice — once in the sidebar list, once as a calendar block.
    await waitFor(() => {
      expect(screen.getAllByText('Studio 1').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Studio 2').length).toBeGreaterThan(0)
    })
  })
})
