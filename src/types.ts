export type Day = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'

export const DAYS: Day[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export const CATEGORIES = [
  'work',
  'social',
  'sport',
  'study',
  'travel',
  'personal',
  'other',
] as const

export type Category = (typeof CATEGORIES)[number]

export interface User {
  id: number
  email: string
  displayName: string
}

/** One selectable option within an activity group, straight from UQ. */
export interface UqActivity {
  id: string
  subjectCode: string
  activityGroupCode: string
  activityCode: string
  activityType: string
  dayOfWeek: Day | null
  startTime: string | null
  durationMins: number
  location: string
  staff: string
  campus: string
  availability: number | null
  selectable: string
  color: string | null
  dates: string[]
  isRecording: boolean
}

export interface UqGroup {
  code: string
  type: string
  options: UqActivity[]
}

export interface UqCourse {
  subjectCode: string
  callistaCode: string
  description: string
  semester: string
  campus: string
  manager: string
  groups: UqGroup[]
}

/** A UQ class the user has committed to their timetable. */
export interface PickedClass {
  id: number
  subjectCode: string
  callistaCode: string
  description: string
  semester: string | null
  campus: string | null
  activityGroupCode: string
  activityCode: string
  activityType: string | null
  dayOfWeek: Day | null
  startTime: string | null
  durationMins: number
  location: string | null
  staff: string | null
  color: string | null
  dates: string[]
}

export interface CustomEvent {
  id: number
  title: string
  category: Category
  recurrence: 'weekly' | 'once'
  dayOfWeek: Day | null
  eventDate: string | null
  startTime: string
  durationMins: number
  location: string | null
  notes: string | null
  color: string | null
}

export interface Timetable {
  id: number
  userId: number
  name: string
  shareToken: string | null
  isShared: boolean
  createdAt: string
  updatedAt: string
  classes: PickedClass[]
  events: CustomEvent[]
}

export interface TimetableSummary {
  id: number
  name: string
  shareToken: string | null
  isShared: boolean
  updatedAt: string
}

export interface SharedTimetable {
  name: string
  ownerName: string
  classes: PickedClass[]
  events: CustomEvent[]
}

/** Someone else's timetable, followed via their share link and overlaid read-only. */
export interface FollowedTimetable {
  id: number
  timetableId: number
  ownerName: string
  timetableName: string
  available: boolean
  classes: PickedClass[]
  events: CustomEvent[]
}

/** A single positioned block on the calendar grid. */
export interface Occurrence {
  key: string
  kind: 'class' | 'event'
  title: string
  subtitle: string
  location: string | null
  day: Day
  date: string
  startMins: number
  endMins: number
  category: Category | null
  classRef?: PickedClass
  eventRef?: CustomEvent
  /** Set when this block belongs to a followed timetable, not the viewer's own. */
  person?: { key: string; name: string }
}
