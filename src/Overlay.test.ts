import { describe, expect, it } from 'vitest'
import type { Occurrence } from './types'
import { findClashes, railSegments } from './lib/schedule'

function occ(partial: Partial<Occurrence> & { key: string; startMins: number; endMins: number }): Occurrence {
  return {
    kind: 'class',
    title: 'COMP3506',
    subtitle: 'Lecture',
    location: null,
    day: 'Mon',
    date: '2026-07-27',
    category: null,
    ...partial,
  }
}

describe('railSegments', () => {
  it('merges back-to-back blocks into one stripe but keeps the parts', () => {
    const segments = railSegments([
      occ({ key: 'a', startMins: 600, endMins: 720, title: 'MATH1071' }),
      occ({ key: 'b', startMins: 720, endMins: 780, title: 'PHYS1001' }),
    ])

    expect(segments).toHaveLength(1)
    expect(segments[0].startMins).toBe(600)
    expect(segments[0].endMins).toBe(780)
    expect(segments[0].parts.map((p) => p.title)).toEqual(['MATH1071', 'PHYS1001'])
  })

  it('keeps blocks separated by a gap as separate stripes', () => {
    const segments = railSegments([
      occ({ key: 'a', startMins: 600, endMins: 720 }),
      occ({ key: 'b', startMins: 780, endMins: 840 }),
    ])

    expect(segments.map((s) => [s.startMins, s.endMins])).toEqual([
      [600, 720],
      [780, 840],
    ])
  })

  it('takes the furthest end when one block swallows another', () => {
    const segments = railSegments([
      occ({ key: 'a', startMins: 600, endMins: 900 }),
      occ({ key: 'b', startMins: 660, endMins: 720 }),
    ])

    expect(segments).toHaveLength(1)
    expect(segments[0].endMins).toBe(900)
  })

  it('is unfazed by input that is not already in time order', () => {
    const segments = railSegments([
      occ({ key: 'b', startMins: 780, endMins: 840 }),
      occ({ key: 'a', startMins: 600, endMins: 660 }),
    ])

    expect(segments.map((s) => s.startMins)).toEqual([600, 780])
  })
})

describe('findClashes', () => {
  const alex = { key: '42', name: 'Alex' }

  it('flags two of your own blocks that overlap', () => {
    const clashes = findClashes([
      occ({ key: 'mine-a', startMins: 600, endMins: 720 }),
      occ({ key: 'mine-b', startMins: 660, endMins: 780 }),
    ])

    expect(clashes).toEqual(new Set(['mine-a', 'mine-b']))
  })

  it('does not flag your block against a followed person overlapping it', () => {
    const clashes = findClashes([
      occ({ key: 'mine', startMins: 600, endMins: 720 }),
      occ({ key: 'theirs', startMins: 660, endMins: 780, person: alex }),
    ])

    expect(clashes.size).toBe(0)
  })

  it('does not flag two different people against each other', () => {
    const clashes = findClashes([
      occ({ key: 'alex', startMins: 600, endMins: 720, person: alex }),
      occ({ key: 'sam', startMins: 660, endMins: 780, person: { key: '43', name: 'Sam' } }),
    ])

    expect(clashes.size).toBe(0)
  })

  it('still flags one person double-booked against themselves', () => {
    const clashes = findClashes([
      occ({ key: 'alex-a', startMins: 600, endMins: 720, person: alex }),
      occ({ key: 'alex-b', startMins: 660, endMins: 780, person: alex }),
    ])

    expect(clashes).toEqual(new Set(['alex-a', 'alex-b']))
  })

  it('leaves recordings out of it, since they are watch-whenever', () => {
    const clashes = findClashes([
      occ({ key: 'live', startMins: 600, endMins: 720 }),
      occ({ key: 'rec', startMins: 660, endMins: 780, subtitle: 'Lecture (recording)', location: 'Delayed viewing' }),
    ])

    expect(clashes.size).toBe(0)
  })
})
