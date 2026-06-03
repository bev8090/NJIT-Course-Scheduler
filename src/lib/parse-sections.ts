/**
 * Parses the SECTIONS_TABLE HTML blob returned by NJIT's
 * `stuRegCrseSchedSections` endpoint into structured Course[] data.
 *
 * The NJIT response is one big string of HTML — alternating <h4> course
 * headers and <table class="sections-table"> tables. We use cheerio (a
 * server-side jQuery-like DOM parser) to walk the structure and extract
 * each cell into our typed schema.
 *
 * After parsing, we run `mergeHonorsVariants` to fold "X - HONORS" catalog
 * entries into the base course so the UI shows one entry per course code
 * with honors sections badged inline.
 */

import * as cheerio from 'cheerio';
import type { Course, DayCode, Meeting, Section, SectionStatus } from './types';

// ────────────────────────────────────────────────────────────────────────────
// Small parsing helpers
// ────────────────────────────────────────────────────────────────────────────

const DAY_CODES = new Set<DayCode>(['M', 'T', 'W', 'R', 'F', 'S', 'U']);

/** Turn the raw "MW" / "TR" / "MWF" cell into typed day codes. */
function parseDays(s: string): DayCode[] {
  const out: DayCode[] = [];
  for (const ch of s.trim()) {
    if (DAY_CODES.has(ch as DayCode)) out.push(ch as DayCode);
  }
  return out;
}

/**
 * Parse "10:00 AM - 11:20 AM" into minutes-from-midnight. Returns nulls when
 * the cell is blank (TBA / async-online), so callers can branch on that.
 */
function parseTimes(s: string): { startMinutes: number | null; endMinutes: number | null } {
  const m = s
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return { startMinutes: null, endMinutes: null };
  const toMin = (h: string, mn: string, ap: string) => {
    let hh = parseInt(h, 10);
    const period = ap.toUpperCase();
    // 12:30 PM is 12:30; 1:00 PM is 13:00; 12:00 AM is 00:00; 1:00 AM is 01:00.
    if (period === 'PM' && hh !== 12) hh += 12;
    if (period === 'AM' && hh === 12) hh = 0;
    return hh * 60 + parseInt(mn, 10);
  };
  return {
    startMinutes: toMin(m[1], m[2], m[3]),
    endMinutes: toMin(m[4], m[5], m[6]),
  };
}

function parseStatus(text: string): SectionStatus {
  // NJIT wraps "Closed" in <strong class="text-danger">. The Open state is
  // either the literal word "Open" or empty cell — we treat anything that
  // doesn't say "closed" as Open.
  return /closed/i.test(text) ? 'Closed' : 'Open';
}

function parseIntOr(s: string, fallback: number): number {
  const n = parseInt(s.trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Split a cell's inner HTML on `<br/>` and return the trimmed text of each
 * fragment. NJIT uses `<br/>`-separated lines inside a single `<td>` to
 * represent multiple meeting times on the same section — e.g.
 *
 *   <td>T<br />F</td>
 *   <td>1:00 PM - 2:20 PM<br />1:00 PM - 2:20 PM</td>
 *   <td>KUPF 210<br />GITC 1400</td>
 *
 * means "this section meets Tuesday 1-2:20 in KUPF 210 AND Friday 1-2:20
 * in GITC 1400". Plain `.text()` collapses the `<br/>` away and smushes
 * the values together, which silently corrupts times and locations.
 */
function cellLines($: cheerio.CheerioAPI, cell: unknown): string[] {
  // We get the cell's inner HTML, split on `<br/>` (any whitespace, optional /),
  // then strip remaining tags and decode entities by feeding each chunk
  // back through cheerio's text extractor.
  const html = $(cell as never).html() ?? '';
  if (!html.match(/<br\s*\/?>/i)) {
    // Common case: single-line cell — fall back to cheap text extraction.
    return [$(cell as never).text().trim()];
  }
  return html
    .split(/<br\s*\/?>/i)
    .map((chunk) => $('<div></div>').html(chunk).text().trim());
}

// ────────────────────────────────────────────────────────────────────────────
// Main parser
// ────────────────────────────────────────────────────────────────────────────

/**
 * Convert the full HTML blob for one (term, subject) into a list of Courses.
 * The blob looks roughly like:
 *
 *   <h4 id="CS 100"><a>CS 100 - ROADMAP TO COMPUTING</a></h4>
 *   <table class="sections-table">
 *     <tr><th>Section</th>...</tr>     ← header row, skipped
 *     <tr><td>001</td><td>91863</td>...</tr>
 *     <tr><td>003</td>...</tr>
 *   </table>
 *   <h4 id="CS 113">...</h4>
 *   <table>...</table>
 *   ...
 *
 * For each <h4>+<table> pair we extract one Course with its Section[].
 */
export function parseSectionsHtml(html: string): Course[] {
  if (!html) return [];

  // Load as a fragment (no implicit <html><body> wrapper).
  const $ = cheerio.load(html, null, false);
  const courses: Course[] = [];

  $('h4').each((_, h4) => {
    const $h4 = $(h4);

    // The <h4> wraps an <a> whose text is "SUBJ NUM - TITLE" and href links
    // to the catalog page. Fall back to the id attr if the link's missing.
    const id = ($h4.attr('id') ?? '').trim();
    const $link = $h4.find('a').first();
    const linkText = $link.text().trim();
    const catalogUrl = $link.attr('href') ?? '';

    let subject = '';
    let number = '';
    let title = '';
    const m = linkText.match(/^(\S+)\s+(\S+)\s*-\s*(.+)$/);
    if (m) {
      subject = m[1];
      number = m[2];
      title = m[3].trim();
    } else if (id) {
      const [s, n] = id.split(/\s+/);
      subject = s ?? '';
      number = n ?? '';
    }

    // The sections table sits immediately after the <h4> in document order.
    const $table = $h4.nextAll('table.sections-table').first();
    const sections: Section[] = [];

    $table.find('tr').each((idx, tr) => {
      if (idx === 0) return; // skip the header row
      const cells = $(tr).find('td');
      if (cells.length < 11) return;

      // Column order (NJIT-defined, do not reorder):
      // 0 Section | 1 CRN | 2 Days | 3 Times | 4 Location | 5 Status |
      // 6 Max | 7 Now | 8 Instructor | 9 Delivery Mode | 10 Credits |
      // 11 Info (book icon, ignored) | 12 Comments
      const sectionNumber = $(cells[0]).text().trim();
      const crn = $(cells[1]).text().trim();
      const statusText = $(cells[5]).text().trim();
      const max = parseIntOr($(cells[6]).text(), 0);
      const now = parseIntOr($(cells[7]).text(), 0);

      const $instrLink = $(cells[8]).find('a').first();
      const instructor = $instrLink.text().trim() || $(cells[8]).text().trim();
      const instructorProfileUrl = $instrLink.attr('href') ?? null;

      const $modeLink = $(cells[9]).find('a').first();
      const deliveryMode = $modeLink.text().trim() || $(cells[9]).text().trim();

      const credits = $(cells[10]).text().trim();
      const comments = cells.length > 12 ? $(cells[12]).text().trim() : '';

      // Days, times, and location can each contain multiple `<br/>`-separated
      // lines for sections that meet at multiple time-of-week slots. Zip the
      // parallel arrays into one Meeting per line — if any cell has fewer
      // lines than the others, reuse its only/last value (NJIT does this for
      // sections where the location is the same across all meetings).
      const dayLines = cellLines($, cells[2]);
      const timeLines = cellLines($, cells[3]);
      const locLines = cellLines($, cells[4]);
      const meetingCount = Math.max(dayLines.length, timeLines.length, locLines.length, 1);
      const pick = (arr: string[], i: number): string =>
        arr[i] ?? arr[arr.length - 1] ?? '';

      const meetings: Meeting[] = [];
      for (let i = 0; i < meetingCount; i++) {
        meetings.push({
          days: parseDays(pick(dayLines, i)),
          ...parseTimes(pick(timeLines, i)),
          location: pick(locLines, i),
        });
      }

      sections.push({
        crn,
        sectionNumber,
        status: parseStatus(statusText),
        maxEnrollment: max,
        currentEnrollment: now,
        isFull: max > 0 && now >= max,
        instructor,
        instructorProfileUrl,
        deliveryMode,
        credits,
        meetings,
        comments,
        // Set later by mergeHonorsVariants when we fold honors variants
        // into the base course; defaults to false for non-honors entries.
        isHonors: false,
      });
    });

    if (subject && number) {
      courses.push({ subject, number, title, catalogUrl, sections });
    }
  });

  return mergeHonorsVariants(courses);
}

// ────────────────────────────────────────────────────────────────────────────
// Honors dedupe
// ────────────────────────────────────────────────────────────────────────────

/**
 * Strip a trailing "- HONORS" / " - HONORS" / "-HONORS" off a course title.
 * Returns the base title and whether it was an honors variant.
 *
 * Patterns we've seen in NJIT data:
 *   "HISTORY OF ARCHITECTURE- HONORS"
 *   "TOOLS AND TECHNIQUES I - HONORS"
 *   "CONCEPTS IN BIOLOGY - HONORS"
 *   "FOUND OF BIO:ECOL & EVOL I-HONORS"
 *   "NEUROPHYSIOLOGY-HONORS"
 */
function stripHonorsSuffix(title: string): { base: string; isHonors: boolean } {
  const m = title.match(/^(.+?)\s*-\s*HONORS?\s*$/i);
  if (m) return { base: m[1].trim(), isHonors: true };
  return { base: title.trim(), isHonors: false };
}

/**
 * Fold honors variants into their base course. NJIT lists e.g. AD 261
 * twice — once as "HISTORY OF ARCHITECTURE" and once as
 * "HISTORY OF ARCHITECTURE- HONORS". Both have the same course code, so
 * showing them as separate entries in the browser is noisy and triggers a
 * React duplicate-key warning. We merge them: the base course keeps its
 * title, the honors sections get `isHonors: true` and are appended to the
 * base's `sections` list.
 *
 * Genuinely-different titles for the same course code (e.g. ARCH 483's nine
 * different ST: Special Topics) are NOT merged — they remain separate
 * Courses so each topic can be searched and selected independently.
 */
function mergeHonorsVariants(courses: Course[]): Course[] {
  // Group courses by (subject, number).
  const byCode = new Map<string, Course[]>();
  for (const c of courses) {
    const key = `${c.subject} ${c.number}`;
    if (!byCode.has(key)) byCode.set(key, []);
    byCode.get(key)!.push(c);
  }

  const out: Course[] = [];

  for (const group of byCode.values()) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }

    // Classify each entry as (baseTitle, isHonorsEntry). Two entries can be
    // merged iff they share the same base title (one is "X", the other "X - HONORS").
    const classified = group.map((c) => ({
      course: c,
      ...stripHonorsSuffix(c.title),
    }));

    // Group inner entries by base title so we merge honors+regular pairs
    // while preserving genuinely-different titles as separate courses.
    const byBase = new Map<string, typeof classified>();
    for (const item of classified) {
      const k = item.base.toLowerCase();
      if (!byBase.has(k)) byBase.set(k, []);
      byBase.get(k)!.push(item);
    }

    for (const sameBase of byBase.values()) {
      // Prefer the non-honors entry as the "base" we keep; if there isn't
      // one (e.g. all entries are honors), fall back to the first.
      const baseEntry =
        sameBase.find((e) => !e.isHonors) ?? sameBase[0];

      const mergedSections: Section[] = [];
      for (const e of sameBase) {
        for (const s of e.course.sections) {
          mergedSections.push(
            // Mark honors sections so the UI can badge them. If the entry
            // itself wasn't honors but the section was already flagged, keep it.
            e.isHonors ? { ...s, isHonors: true } : s,
          );
        }
      }

      out.push({
        subject: baseEntry.course.subject,
        number: baseEntry.course.number,
        title: baseEntry.base,
        catalogUrl: baseEntry.course.catalogUrl,
        sections: mergedSections,
      });
    }
  }

  return out;
}
