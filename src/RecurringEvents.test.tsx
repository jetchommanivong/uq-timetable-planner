import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import type { CustomEvent } from './types'

/**
 * A recurring shift at the same place should be typed once. These cover the
 * multi-day picker and the duplicate action.
 */

const SHIFT: CustomEvent = {
  id: 1,
  title: 'Work at Coles',
  category: 'work',
  recurrence: 'weekly',
  dayOfWeek: 'Mon',
  eventDate: null,
  startTime: '17:00',
  durationMins: 300,
  location: 'Toowong',
  notes: null,
  color: null,
}

const json = (data: unknown, status = 200) =>
  ({ ok: status < 400, status, text: async () => JSON.stringify(data) }) as Response

function mockServer(seed: CustomEvent[] = []) {
  let events = [...seed]
  let nextId = 100
  const posts: any[] = []
  const patches: any[] = []

  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(init.body as string) : null
    const timetable = () => ({
      id: 1, userId: 1, name: 'My timetable', shareToken: null, isShared: false,
      createdAt: '', updatedAt: '', classes: [], events,
    })

    if (url === '/api/auth/me') return json({ user: { id: 1, email: 'a@b.c', displayName: 'Test' } })
    if (url === '/api/timetables' && method === 'GET')
      return json({ timetables: [{ id: 1, name: 'My timetable', shareToken: null, isShared: false, updatedAt: '', classCount: 0, eventCount: events.length }] })
    if (url === '/api/timetables/1' && method === 'GET') return json({ timetable: timetable() })

    if (url === '/api/timetables/1/events' && method === 'POST') {
      posts.push(body)
      events = [...events, { ...body, id: nextId++ }]
      return json({ timetable: timetable() }, 201)
    }
    if (/\/api\/timetables\/1\/events\/\d+$/.test(url) && method === 'PATCH') {
      patches.push(body)
      const id = Number(url.split('/').pop())
      events = events.map((e) => (e.id === id ? { ...e, ...body } : e))
      return json({ timetable: timetable() })
    }
    throw new Error(`unexpected request: ${method} ${url}`)
  })

  return { fetchMock, posts, patches }
}

describe('recurring and duplicated events', () => {
  beforeEach(() => window.history.pushState({}, '', '/'))

  it('creates one event per selected day from a single form', async () => {
    const { fetchMock, posts } = mockServer()
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('UQ Timetable Planner')
    await user.click(await screen.findByText(/Add work, gym, social/i))

    await user.type(screen.getByPlaceholderText(/coffee shop/i), 'Work at Coles')
    // Mon is on by default; add Wed and Fri.
    await user.click(screen.getByRole('button', { name: 'Wed' }))
    await user.click(screen.getByRole('button', { name: 'Fri' }))

    expect(screen.getByText(/Creates 3 weekly events/i)).toBeDefined()

    await user.click(screen.getByText('Save'))

    await waitFor(() => expect(posts.length).toBe(3))
    expect(posts.map((p) => p.dayOfWeek)).toEqual(['Mon', 'Wed', 'Fri'])
    // The title and place are typed once and carried to every day.
    for (const p of posts) expect(p.title).toBe('Work at Coles')
  })

  it('duplicates an existing event, keeping its title and details', async () => {
    const { fetchMock, posts, patches } = mockServer([SHIFT])
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('UQ Timetable Planner')

    // Open the existing shift from the sidebar.
    const sidebar = await screen.findByRole('complementary')
    await user.click(within(sidebar).getByText('Work at Coles'))
    expect(screen.getByText('Edit event')).toBeDefined()

    await user.click(screen.getByText('Duplicate'))

    // Now in create mode, prefilled from the original.
    expect(screen.getByText('Duplicate event')).toBeDefined()
    expect((screen.getByPlaceholderText(/coffee shop/i) as HTMLInputElement).value).toBe(
      'Work at Coles',
    )

    await user.click(screen.getByRole('button', { name: 'Sat' }))
    await user.click(screen.getByText('Save'))

    // A copy is added; the original is untouched.
    await waitFor(() => expect(posts.length).toBe(2))
    expect(patches.length).toBe(0)
    expect(posts.map((p) => p.dayOfWeek).sort()).toEqual(['Mon', 'Sat'])
    expect(posts.every((p) => p.title === 'Work at Coles' && p.location === 'Toowong')).toBe(true)
  })

  it('editing a single-day event still updates in place', async () => {
    const { fetchMock, posts, patches } = mockServer([SHIFT])
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('UQ Timetable Planner')
    const sidebar = await screen.findByRole('complementary')
    await user.click(within(sidebar).getByText('Work at Coles'))

    await user.clear(screen.getByPlaceholderText(/coffee shop/i))
    await user.type(screen.getByPlaceholderText(/coffee shop/i), 'Work at Woolies')
    await user.click(screen.getByText('Save'))

    await waitFor(() => expect(patches.length).toBe(1))
    expect(patches[0].title).toBe('Work at Woolies')
    expect(posts.length).toBe(0)
  })
})
