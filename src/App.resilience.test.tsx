import { StrictMode } from 'react'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

/**
 * The search dialog must close only when the user closes it. These cover the
 * failure modes that could otherwise yank it off screen mid-pick.
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

const json = (data: unknown, status = 200) =>
  ({ ok: status < 400, status, text: async () => JSON.stringify(data) }) as Response

/** `onAddClass` decides what the POST responds with, so each test can break it differently. */
function mockServer(onAddClass: () => Response | Promise<Response>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const empty = {
      id: 1, userId: 1, name: 'My timetable', shareToken: null, isShared: false,
      createdAt: '', updatedAt: '', classes: [], events: [],
    }
    if (url === '/api/auth/me') return json({ user: { id: 1, email: 'a@b.c', displayName: 'Test' } })
    if (url === '/api/timetables' && method === 'GET')
      return json({ timetables: [{ id: 1, name: 'My timetable', shareToken: null, isShared: false, updatedAt: '', classCount: 0, eventCount: 0 }] })
    if (url === '/api/timetables/1' && method === 'GET') return json({ timetable: empty })
    if (url.startsWith('/api/uq/search')) return json({ courses: [COURSE] })
    if (url === '/api/timetables/1/classes' && method === 'POST') return onAddClass()
    throw new Error(`unexpected request: ${method} ${url}`)
  })
}

async function openSearchAndPick() {
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
  return user
}

describe('the search dialog only closes on request', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/')
  })

  it('survives a response with no timetable field', async () => {
    // This is what would previously blank the timetable and unmount the dialog.
    vi.stubGlobal('fetch', mockServer(() => json({}, 201)))
    await openSearchAndPick()

    // Reported in the top banner and inside the dialog, hence getAllByText.
    await waitFor(() => expect(screen.getAllByText(/unexpected response/i).length).toBeGreaterThan(0))
    expect(screen.queryByPlaceholderText(/Search a course code/i)).not.toBeNull()
    expect(screen.queryByRole('heading', { name: /Studio 2/i })).not.toBeNull()
  })

  it('survives a server error and reports it inside the dialog', async () => {
    vi.stubGlobal('fetch', mockServer(() => json({ error: 'Timetable not found' }, 404)))
    await openSearchAndPick()

    await waitFor(() => expect(screen.getByText(/Couldn't save that class/i)).toBeDefined())
    expect(screen.queryByPlaceholderText(/Search a course code/i)).not.toBeNull()
  })

  it('survives a non-JSON response', async () => {
    vi.stubGlobal('fetch', mockServer(() => ({
      ok: true,
      status: 200,
      text: async () => '<!doctype html><html>proxy fell over</html>',
    }) as Response))
    await openSearchAndPick()

    await waitFor(() => expect(screen.getByText(/Couldn't save that class/i)).toBeDefined())
    expect(screen.queryByPlaceholderText(/Search a course code/i)).not.toBeNull()
  })

  it('survives a rejected request', async () => {
    vi.stubGlobal('fetch', mockServer(() => Promise.reject(new Error('Failed to fetch'))))
    await openSearchAndPick()

    await waitFor(() => expect(screen.getByText(/Couldn't save that class/i)).toBeDefined())
    expect(screen.queryByPlaceholderText(/Search a course code/i)).not.toBeNull()
  })

  it('closes when the user clicks Done', async () => {
    vi.stubGlobal('fetch', mockServer(() => json({}, 201)))
    const user = await openSearchAndPick()
    await user.click(screen.getByText('Done'))
    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/Search a course code/i)).toBeNull(),
    )
  })
})
