import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

const MY_CLASS = {
  id: 1,
  subjectCode: 'DECO3500_S2',
  callistaCode: 'DECO3500',
  description: 'Social and Mobile Computing',
  semester: 'S2',
  campus: 'STLUCIA',
  activityGroupCode: 'STU01',
  activityCode: '01',
  activityType: 'Studio',
  dayOfWeek: 'Tue',
  startTime: '11:00',
  durationMins: 180,
  location: 'Adv Eng',
  staff: '',
  color: null,
  dates: ['2026-07-28'],
}

const ALEX_CLASS = {
  ...MY_CLASS,
  id: 2,
  subjectCode: 'COMP3506_S2',
  callistaCode: 'COMP3506',
  activityGroupCode: 'LEC01',
  dayOfWeek: 'Tue',
  startTime: '13:00',
  durationMins: 60,
  location: 'Zelman Cowen',
}

function mockServer() {
  let follows: any[] = []

  return vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(init.body as string) : null
    const json = (data: unknown, status = 200) =>
      ({ ok: status < 400, status, text: async () => JSON.stringify(data) }) as Response

    if (url === '/api/auth/me') return json({ user: { id: 1, email: 'a@b.c', displayName: 'Me' } })
    if (url === '/api/timetables' && method === 'GET')
      return json({ timetables: [{ id: 1, name: 'My timetable', shareToken: null, isShared: false, updatedAt: '' }] })
    if (url === '/api/timetables/1' && method === 'GET')
      return json({
        timetable: { id: 1, userId: 1, name: 'My timetable', shareToken: null, isShared: false, createdAt: '', updatedAt: '', classes: [MY_CLASS], events: [] },
      })
    if (url === '/api/follows' && method === 'GET') return json({ follows })
    if (url === '/api/follows' && method === 'POST') {
      if (body.shareToken !== 'alex-token') return json({ error: 'This timetable is not shared' }, 404)
      follows = [
        { id: 9, timetableId: 42, ownerName: 'Alex', timetableName: "Alex's timetable", available: true, classes: [ALEX_CLASS], events: [] },
      ]
      return json({ follows }, 201)
    }

    throw new Error(`Unhandled request: ${method} ${url}`)
  })
}

describe('following someone else\'s timetable', () => {
  it('adds a followed timetable and renders it as an overlay on the grid', async () => {
    vi.stubGlobal('fetch', mockServer())
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => expect(screen.getByText('My timetable')).toBeDefined())

    // Own class renders (once in the sidebar list, once as a grid block).
    await waitFor(() => expect(screen.getAllByText('DECO3500').length).toBeGreaterThan(0))

    const input = screen.getByPlaceholderText('Paste a share link')
    await user.type(input, 'https://example.com/s/alex-token')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    // Follower shows up in the People list, and again in the grid's legend.
    await waitFor(() => expect(screen.getAllByText('Alex').length).toBeGreaterThan(1))

    // Their class renders as a rail rather than a block that steals column
    // width, so the detail lives on the rail's accessible name.
    expect(await screen.findByLabelText(/^Alex · COMP3506 Studio, 1pm/)).toBeDefined()

    // Their class must not squeeze the viewer's own block out of full width.
    const mine = screen.getByTitle(/DECO3500 · Studio/)
    expect(mine.style.width).toBe('calc(100% - 4px)')
  })
})
