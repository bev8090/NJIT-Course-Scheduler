/**
 * Generates an iCalendar (.ics) file from a student's selected sections
 * so they can drop their schedule into Google Calendar / Apple Calendar /
 * Outlook with one click.
 *
 * The output conforms to RFC 5545 (the iCalendar spec) — quirks include
 * CRLF line endings, comma/semicolon/backslash escaping in text fields,
 * and the BYDAY recurrence syntax (MO/TU/WE/TH/FR/SA/SU). Most of the
 * fiddly bits live in this file.
 *
 * Term dates are guessed from the term code because NJIT's API doesn't
 * publish them — students can hand-edit if needed.
 */

import type { Course, DayCode, Section } from './types';

/** Map NJIT's letter day codes to iCalendar's 2-letter RRULE BYDAY codes. */
const ICAL_DAYS: Record<DayCode, string> = {
  M: 'MO', T: 'TU', W: 'WE', R: 'TH', F: 'FR', S: 'SA', U: 'SU',
};

function pad(n: number, len = 2): string {
  return n.toString().padStart(len, '0');
}

/**
 * Given a start-of-term date, find the first calendar date on/after it
 * that falls on `day`. We need this because the iCal DTSTART for a
 * weekly-recurring event must be the actual first occurrence, not the
 * term-start date.
 */
function nextDateOnOrAfter(start: Date, day: DayCode): Date {
  // JS Date: 0=Sunday … 6=Saturday. Our day codes use M-F-S-U.
  const targetDow = { U: 0, M: 1, T: 2, W: 3, R: 4, F: 5, S: 6 }[day];
  const out = new Date(start);
  const diff = (targetDow - out.getDay() + 7) % 7;
  out.setDate(out.getDate() + diff);
  return out;
}

/**
 * Format a Date + minutes-from-midnight as iCal's local-time stamp:
 * "YYYYMMDDTHHMM00". No timezone suffix → the calendar app interprets
 * this in the user's local time, which is what we want for class times.
 */
function fmtLocalDateTime(d: Date, minutes: number): string {
  const y = d.getFullYear();
  const mo = pad(d.getMonth() + 1);
  const da = pad(d.getDate());
  const h = pad(Math.floor(minutes / 60));
  const mi = pad(minutes % 60);
  return `${y}${mo}${da}T${h}${mi}00`;
}

/**
 * RFC 5545 §3.3.11: backslashes, newlines, commas, and semicolons inside
 * text fields (SUMMARY, DESCRIPTION, LOCATION) must be escaped.
 */
function escapeICS(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

export interface IcalOptions {
  termCode: string;
  termDescription: string;
  termStart: Date;
  termEnd: Date;
}

/**
 * Build a complete .ics file string for the given selected sections.
 * Each section becomes one VEVENT per meeting (a section with lecture+lab
 * yields two events). Each VEVENT recurs weekly until the term ends.
 */
export function buildIcs(
  refs: { course: Course; section: Section }[],
  opts: IcalOptions,
): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NJIT Course Scheduler+//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICS(`NJIT ${opts.termDescription}`)}`,
  ];

  // UNTIL is the last instant any event can recur — set to 23:59:59 on the
  // term-end date so the final class still fires.
  const untilStr = `${opts.termEnd.getFullYear()}${pad(opts.termEnd.getMonth() + 1)}${pad(opts.termEnd.getDate())}T235959`;
  // DTSTAMP must be UTC ("Z" suffix); it's just when the file was generated.
  const dtstamp = `${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;

  for (const { course, section } of refs) {
    for (const meeting of section.meetings) {
      // Skip TBA/async-online meetings — calendars can't represent them as recurring events.
      if (meeting.startMinutes == null || meeting.endMinutes == null) continue;
      if (meeting.days.length === 0) continue;

      // The recurrence rule (BYDAY) covers all days, but the DTSTART/DTEND
      // need to be ONE concrete occurrence. We anchor it to the first day
      // in the meeting's `days` list at/after the term-start date.
      const firstDay = meeting.days[0];
      const firstDate = nextDateOnOrAfter(opts.termStart, firstDay);
      const byDay = meeting.days.map((d) => ICAL_DAYS[d]).join(',');

      lines.push('BEGIN:VEVENT');
      // UID must be globally unique per event. CRN+days gives stability —
      // re-importing replaces (not duplicates) the same event.
      lines.push(`UID:${section.crn}-${meeting.days.join('')}@njit-scheduler`);
      lines.push(`DTSTAMP:${dtstamp}`);
      lines.push(`SUMMARY:${escapeICS(`${course.subject} ${course.number} - ${course.title}`)}`);
      lines.push(
        `DESCRIPTION:${escapeICS(
          `Section ${section.sectionNumber} (CRN ${section.crn})\nInstructor: ${section.instructor || 'TBA'}\nDelivery: ${section.deliveryMode}\nCredits: ${section.credits}`,
        )}`,
      );
      if (meeting.location) lines.push(`LOCATION:${escapeICS(meeting.location)}`);
      lines.push(`DTSTART:${fmtLocalDateTime(firstDate, meeting.startMinutes)}`);
      lines.push(`DTEND:${fmtLocalDateTime(firstDate, meeting.endMinutes)}`);
      lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${byDay};UNTIL=${untilStr}`);
      lines.push('END:VEVENT');
    }
  }

  lines.push('END:VCALENDAR');
  // RFC 5545 mandates CRLF line endings; many parsers tolerate LF but some don't.
  return lines.join('\r\n') + '\r\n';
}

/**
 * Approximate term start/end dates from the term code. NJIT doesn't publish
 * these via the API, so we hard-code typical academic-calendar windows —
 * close enough that the student's calendar gets the right semester block.
 */
export function termGuessDates(termCode: string): { start: Date; end: Date } {
  const year = parseInt(termCode.slice(0, 4), 10);
  const season = termCode.slice(4);
  switch (season) {
    case '10': // Spring: roughly mid-Jan to mid-May
      return { start: new Date(year, 0, 21), end: new Date(year, 4, 15) };
    case '50': // Summer: late-May to mid-Aug
      return { start: new Date(year, 4, 22), end: new Date(year, 7, 14) };
    case '90': // Fall: early Sept to mid-Dec
      return { start: new Date(year, 8, 2), end: new Date(year, 11, 20) };
    case '95': // Winter: late Dec to mid-Jan of the NEXT calendar year
      return { start: new Date(year, 11, 22), end: new Date(year + 1, 0, 17) };
    default:
      return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1) };
  }
}

/**
 * Trigger a file download in the browser. Creates an in-memory blob URL,
 * synthesizes a click on a hidden anchor, and revokes the URL after. The
 * filename will be `njit-<termCode>.ics`.
 */
export function downloadIcs(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
