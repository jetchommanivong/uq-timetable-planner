import type {
  FollowedTimetable,
  SharedTimetable,
  Timetable,
  TimetableSummary,
  UqCourse,
  User,
} from './types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  })

  const text = await res.text()
  const data = text ? JSON.parse(text) : {}

  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data as T
}

export const api = {
  me: () => request<{ user: User | null }>('/api/auth/me'),

  register: (body: { email: string; displayName: string; password: string }) =>
    request<{ user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  login: (body: { email: string; password: string }) =>
    request<{ user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),

  searchCourses: (q: string) =>
    request<{ courses: UqCourse[] }>(`/api/uq/search?q=${encodeURIComponent(q)}`),

  listTimetables: () => request<{ timetables: TimetableSummary[] }>('/api/timetables'),

  createTimetable: (name: string) =>
    request<{ timetable: Timetable }>('/api/timetables', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  getTimetable: (id: number) => request<{ timetable: Timetable }>(`/api/timetables/${id}`),

  updateTimetable: (id: number, body: { name?: string; isShared?: boolean }) =>
    request<{ timetable: Timetable }>(`/api/timetables/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  deleteTimetable: (id: number) =>
    request<{ ok: true }>(`/api/timetables/${id}`, { method: 'DELETE' }),

  addClass: (id: number, body: unknown) =>
    request<{ timetable: Timetable }>(`/api/timetables/${id}/classes`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  removeClass: (id: number, classId: number) =>
    request<{ timetable: Timetable }>(`/api/timetables/${id}/classes/${classId}`, {
      method: 'DELETE',
    }),

  removeCourse: (id: number, subjectCode: string) =>
    request<{ timetable: Timetable }>(
      `/api/timetables/${id}/courses/${encodeURIComponent(subjectCode)}`,
      { method: 'DELETE' },
    ),

  addEvent: (id: number, body: unknown) =>
    request<{ timetable: Timetable }>(`/api/timetables/${id}/events`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateEvent: (id: number, eventId: number, body: unknown) =>
    request<{ timetable: Timetable }>(`/api/timetables/${id}/events/${eventId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  removeEvent: (id: number, eventId: number) =>
    request<{ timetable: Timetable }>(`/api/timetables/${id}/events/${eventId}`, {
      method: 'DELETE',
    }),

  getShared: (token: string) =>
    request<{ timetable: SharedTimetable }>(`/api/share/${encodeURIComponent(token)}`),

  listFollows: () => request<{ follows: FollowedTimetable[] }>('/api/follows'),

  addFollow: (shareToken: string) =>
    request<{ follows: FollowedTimetable[] }>('/api/follows', {
      method: 'POST',
      body: JSON.stringify({ shareToken }),
    }),

  removeFollow: (id: number) =>
    request<{ follows: FollowedTimetable[] }>(`/api/follows/${id}`, { method: 'DELETE' }),
}
