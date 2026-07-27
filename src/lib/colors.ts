import type { Category } from '../types'

/**
 * Every block gets a hue. Courses cycle through a palette keyed by course code
 * so a subject keeps the same colour across sessions, and custom categories
 * have fixed colours so work always reads as work.
 */
export interface Swatch {
  bg: string
  border: string
  text: string
  dot: string
}

const COURSE_PALETTE: Swatch[] = [
  { bg: 'rgb(219 234 254 / 0.85)', border: 'rgb(59 130 246)', text: 'rgb(30 58 138)', dot: 'rgb(59 130 246)' },
  { bg: 'rgb(220 252 231 / 0.85)', border: 'rgb(34 197 94)', text: 'rgb(20 83 45)', dot: 'rgb(34 197 94)' },
  { bg: 'rgb(243 232 255 / 0.85)', border: 'rgb(168 85 247)', text: 'rgb(88 28 135)', dot: 'rgb(168 85 247)' },
  { bg: 'rgb(255 237 213 / 0.85)', border: 'rgb(249 115 22)', text: 'rgb(124 45 18)', dot: 'rgb(249 115 22)' },
  { bg: 'rgb(207 250 254 / 0.85)', border: 'rgb(6 182 212)', text: 'rgb(22 78 99)', dot: 'rgb(6 182 212)' },
  { bg: 'rgb(252 231 243 / 0.85)', border: 'rgb(236 72 153)', text: 'rgb(131 24 67)', dot: 'rgb(236 72 153)' },
  { bg: 'rgb(254 249 195 / 0.85)', border: 'rgb(234 179 8)', text: 'rgb(113 63 18)', dot: 'rgb(234 179 8)' },
  { bg: 'rgb(224 231 255 / 0.85)', border: 'rgb(99 102 241)', text: 'rgb(49 46 129)', dot: 'rgb(99 102 241)' },
]

const CATEGORY_SWATCHES: Record<Category, Swatch> = {
  work:     { bg: 'rgb(254 226 226 / 0.85)', border: 'rgb(239 68 68)',  text: 'rgb(127 29 29)',  dot: 'rgb(239 68 68)' },
  social:   { bg: 'rgb(252 231 243 / 0.85)', border: 'rgb(236 72 153)', text: 'rgb(131 24 67)',  dot: 'rgb(236 72 153)' },
  sport:    { bg: 'rgb(209 250 229 / 0.85)', border: 'rgb(16 185 129)', text: 'rgb(6 78 59)',    dot: 'rgb(16 185 129)' },
  study:    { bg: 'rgb(224 231 255 / 0.85)', border: 'rgb(99 102 241)', text: 'rgb(49 46 129)',  dot: 'rgb(99 102 241)' },
  travel:   { bg: 'rgb(255 237 213 / 0.85)', border: 'rgb(249 115 22)', text: 'rgb(124 45 18)',  dot: 'rgb(249 115 22)' },
  personal: { bg: 'rgb(237 233 254 / 0.85)', border: 'rgb(139 92 246)', text: 'rgb(76 29 149)',  dot: 'rgb(139 92 246)' },
  other:    { bg: 'rgb(241 245 249 / 0.9)',  border: 'rgb(100 116 139)', text: 'rgb(30 41 59)',  dot: 'rgb(100 116 139)' },
}

/** Stable hash so a course keeps its colour between page loads. */
function hash(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function courseSwatch(code: string): Swatch {
  return COURSE_PALETTE[hash(code) % COURSE_PALETTE.length]
}

export function categorySwatch(category: Category): Swatch {
  return CATEGORY_SWATCHES[category] ?? CATEGORY_SWATCHES.other
}

export const CATEGORY_LABEL: Record<Category, string> = {
  work: 'Work',
  social: 'Social',
  sport: 'Sport / gym',
  study: 'Study',
  travel: 'Travel',
  personal: 'Personal',
  other: 'Other',
}
