/**
 * Pure functions used by the React UI to:
 *   - lay out sections on the schedule grid (which day column, what pixel offset)
 *   - detect time-of-week conflicts between selected sections
 *   - format days/times/credits for display
 *   - normalize delivery-mode strings into broad buckets for filtering
 *
 * Everything in this file is side-effect-free and easy to unit-test.
 */

import type { Course, DayCode, Meeting, Section } from './types';

// ────────────────────────────────────────────────────────────────────────────
// Day-of-week constants
// ────────────────────────────────────────────────────────────────────────────

/** Days shown as columns in the grid. The product spec chose Mon-Fri only. */
export const WEEKDAYS: DayCode[] = ['M', 'T', 'W', 'R', 'F'];

/** Days NOT shown in the grid — anything meeting on these falls into the "off-grid" list. */
export const WEEKEND: DayCode[] = ['S', 'U'];

export const DAY_LABEL: Record<DayCode, string> = {
  M: 'Mon', T: 'Tue', W: 'Wed', R: 'Thu', F: 'Fri', S: 'Sat', U: 'Sun',
};
export const DAY_LONG: Record<DayCode, string> = {
  M: 'Monday', T: 'Tuesday', W: 'Wednesday', R: 'Thursday',
  F: 'Friday', S: 'Saturday', U: 'Sunday',
};

// ────────────────────────────────────────────────────────────────────────────
// Section placement (course + section + which meeting we're showing)
// ────────────────────────────────────────────────────────────────────────────

/**
 * A section + one of its meetings, with its parent Course attached for display.
 * Why "placed"? A section can have multiple meetings (lecture + lab); each one
 * draws as its own grid block, so we flatten before rendering.
 */
export interface PlacedSection {
  course: Course;
  section: Section;
  meeting: Meeting;
}

/** A selected section with its parent Course — what the UI stores in state. */
export interface SectionRef {
  course: Course;
  section: Section;
}

/** Flatten SectionRef[] into one PlacedSection per (section, meeting) pair. */
export function placeSections(refs: SectionRef[]): PlacedSection[] {
  const out: PlacedSection[] = [];
  for (const { course, section } of refs) {
    for (const meeting of section.meetings) {
      out.push({ course, section, meeting });
    }
  }
  return out;
}

/** True iff this meeting has a real day+time on a weekday — i.e. it draws on the grid. */
export function isWeekdayMeeting(m: Meeting): boolean {
  if (m.startMinutes == null || m.endMinutes == null) return false;
  return m.days.some((d) => WEEKDAYS.includes(d));
}

/**
 * True for meetings the grid can't render: weekend-only, TBA times, async
 * online (no times at all). These get listed in a separate panel below the grid.
 */
export function isOffGrid(m: Meeting): boolean {
  if (m.startMinutes == null || m.endMinutes == null) return true;
  return m.days.length === 0 || !m.days.some((d) => WEEKDAYS.includes(d));
}

// ────────────────────────────────────────────────────────────────────────────
// Conflict detection
// ────────────────────────────────────────────────────────────────────────────

/**
 * Two meetings overlap iff they share at least one day AND their time
 * intervals intersect. TBA/async meetings (null times) never overlap.
 */
export function meetingsOverlap(a: Meeting, b: Meeting): boolean {
  if (
    a.startMinutes == null || a.endMinutes == null ||
    b.startMinutes == null || b.endMinutes == null
  ) {
    return false;
  }
  const sharedDay = a.days.some((d) => b.days.includes(d));
  if (!sharedDay) return false;
  // Open-interval intersection: A starts before B ends AND B starts before A ends.
  return a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
}

export interface Conflict {
  a: SectionRef;
  b: SectionRef;
}

/**
 * All pairwise conflicts between the selected sections, deduped so each pair
 * appears once regardless of how many meetings overlap or which order we
 * encounter them in.
 */
export function findConflicts(refs: SectionRef[]): Conflict[] {
  const placed = placeSections(refs);
  const conflicts: Conflict[] = [];
  const seenPairs = new Set<string>();
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const A = placed[i];
      const B = placed[j];
      // Same CRN can show up multiple times if the section has multiple meetings.
      if (A.section.crn === B.section.crn) continue;
      if (!meetingsOverlap(A.meeting, B.meeting)) continue;
      // Canonicalize the pair key so (a,b) and (b,a) collapse.
      const key =
        A.section.crn < B.section.crn
          ? `${A.section.crn}|${B.section.crn}`
          : `${B.section.crn}|${A.section.crn}`;
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      conflicts.push({
        a: { course: A.course, section: A.section },
        b: { course: B.course, section: B.section },
      });
    }
  }
  return conflicts;
}

/**
 * Index: CRN → set of other CRNs it conflicts with.
 * Lets the UI ask "does this section have any conflicts?" in O(1) per row.
 */
export function conflictsByCrn(conflicts: Conflict[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const { a, b } of conflicts) {
    if (!map.has(a.section.crn)) map.set(a.section.crn, new Set());
    if (!map.has(b.section.crn)) map.set(b.section.crn, new Set());
    map.get(a.section.crn)!.add(b.section.crn);
    map.get(b.section.crn)!.add(a.section.crn);
  }
  return map;
}

// ────────────────────────────────────────────────────────────────────────────
// Credits
// ────────────────────────────────────────────────────────────────────────────

/** Extract a numeric credit value from NJIT's free-form text like "3", "1-3", "0.5". */
export function parseCredits(s: string): number {
  const m = s.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

export function totalCredits(refs: SectionRef[]): number {
  return refs.reduce((sum, r) => sum + parseCredits(r.section.credits), 0);
}

// ────────────────────────────────────────────────────────────────────────────
// Grid sizing
// ────────────────────────────────────────────────────────────────────────────

/**
 * Pick the hour range the grid should show. Default 8 AM – 9 PM covers
 * almost every NJIT class; we widen automatically if any selected section
 * starts earlier or ends later so blocks never get clipped.
 */
export function gridHourRange(placed: PlacedSection[]): {
  startHour: number;
  endHour: number;
} {
  const DEFAULT_START = 8;
  const DEFAULT_END = 21;
  if (placed.length === 0) return { startHour: DEFAULT_START, endHour: DEFAULT_END };
  let minM = Infinity;
  let maxM = -Infinity;
  for (const p of placed) {
    if (!isWeekdayMeeting(p.meeting)) continue;
    if (p.meeting.startMinutes! < minM) minM = p.meeting.startMinutes!;
    if (p.meeting.endMinutes! > maxM) maxM = p.meeting.endMinutes!;
  }
  if (!Number.isFinite(minM) || !Number.isFinite(maxM)) {
    return { startHour: DEFAULT_START, endHour: DEFAULT_END };
  }
  const startHour = Math.min(DEFAULT_START, Math.floor(minM / 60));
  const endHour = Math.max(DEFAULT_END, Math.ceil(maxM / 60));
  return { startHour, endHour };
}

// ────────────────────────────────────────────────────────────────────────────
// Display formatters
// ────────────────────────────────────────────────────────────────────────────

/** Render minutes-from-midnight as "10:00 AM" / "1:30 PM". */
export function formatTime(minutes: number): string {
  let h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, '0')} ${period}`;
}

export function formatTimeRange(start: number | null, end: number | null): string {
  if (start == null || end == null) return 'TBA';
  return `${formatTime(start)} – ${formatTime(end)}`;
}

export function formatDays(days: DayCode[]): string {
  return days.length ? days.join('') : 'TBA';
}

// ────────────────────────────────────────────────────────────────────────────
// Delivery-mode bucketing
// ────────────────────────────────────────────────────────────────────────────

/**
 * NJIT uses many delivery-mode strings ("Online Newark", "Online Virtual",
 * "Converged Learning", "Synchronous Online", etc.) but the filter chips
 * present three buckets. This collapses the raw string into the bucket.
 */
export type DeliveryBucket = 'Face-to-Face' | 'Hybrid' | 'Online' | 'Other';

export function deliveryBucket(raw: string): DeliveryBucket {
  const s = raw.toLowerCase();
  if (s.includes('face-to-face')) return 'Face-to-Face';
  if (s.includes('hybrid')) return 'Hybrid';
  if (s.includes('online')) return 'Online';
  // "Converged Learning" mixes in-person + remote attendees → treat as Hybrid.
  if (s.includes('converged')) return 'Hybrid';
  // "Synchronous Online" = live-streamed online class.
  if (s.includes('synchronous')) return 'Online';
  return 'Other';
}

/** Sorted, deduped list of all instructor names across all sections — used to populate the filter dropdown. */
export function uniqueInstructors(courses: Course[]): string[] {
  const set = new Set<string>();
  for (const c of courses) {
    for (const s of c.sections) {
      if (s.instructor) set.add(s.instructor);
    }
  }
  return [...set].sort();
}
