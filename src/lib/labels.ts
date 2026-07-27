import type { PickedClass, UqCourse, UqGroup } from '../types'

/**
 * Naming classes is fiddlier than it looks.
 *
 * UQ splits a course into activity *groups* (LEC01, STU01, STU02 ...), and you
 * attend one option from every group. So DECO3500's STU01 and STU02 are two
 * different studio sessions you both go to — not alternatives.
 *
 * Naively rendering `activityType + activityCode` gives both of them the label
 * "Studio 01", which makes them impossible to tell apart. These helpers add a
 * stream number only when a course actually has more than one group of that
 * type, so single-stream courses stay uncluttered.
 */

/** Trailing digits of a group code: "STU02" -> 2. */
function streamNumber(groupCode: string): number | null {
  const m = /(\d+)$/.exec(groupCode)
  return m ? Number(m[1]) : null
}

function typeOf(type: string | null | undefined, groupCode: string): string {
  return type || groupCode
}

/** True when the course runs several parallel groups of the same activity type. */
export function hasMultipleStreams(groupCodes: string[]): boolean {
  return new Set(groupCodes).size > 1
}

/**
 * Label for one picked class, disambiguated against the rest of that course.
 * e.g. "Studio 1", "Studio 2", "Tutorial 03", "Lecture 1 (recording)".
 */
export function classLabel(cls: PickedClass, allClasses: PickedClass[]): string {
  const type = typeOf(cls.activityType, cls.activityGroupCode)

  const sameCourseSameType = allClasses.filter(
    (c) =>
      c.subjectCode === cls.subjectCode &&
      typeOf(c.activityType, c.activityGroupCode) === type,
  )
  const multiStream = hasMultipleStreams(sameCourseSameType.map((c) => c.activityGroupCode))

  const isRecording = /_recorded$/i.test(cls.activityCode)
  const optionCode = cls.activityCode.replace(/_recorded$/i, '')

  const parts = [type]

  const stream = streamNumber(cls.activityGroupCode)
  if (multiStream && stream !== null) parts.push(String(stream))

  // "01" is the only option in its group often enough that showing it is noise.
  if (optionCode && optionCode !== '01') parts.push(optionCode)

  if (isRecording) parts.push('(recording)')

  return parts.join(' ')
}

/** Heading for an activity group in the course search results. */
export function groupLabel(course: UqCourse, group: UqGroup): string {
  const type = typeOf(group.type, group.code)
  const sameType = course.groups.filter((g) => typeOf(g.type, g.code) === type)

  if (sameType.length <= 1) return type

  const stream = streamNumber(group.code)
  return stream !== null ? `${type} ${stream}` : `${type} (${group.code})`
}

/**
 * How to phrase what the user must do with a group:
 * one option means it's compulsory, several means they choose.
 */
export function groupHint(group: UqGroup): string {
  return group.options.length > 1 ? 'pick one' : 'required'
}

/** Groups the user has at least one class from, for "2 of 3 added" progress. */
export function selectedGroupCount(course: UqCourse, picked: PickedClass[]): number {
  const chosen = new Set(
    picked.filter((p) => p.subjectCode === course.subjectCode).map((p) => p.activityGroupCode),
  )
  return course.groups.filter((g) => chosen.has(g.code)).length
}
