/**
 * Shared data shapes used by both the scraper (Node) and the React UI.
 *
 * The scraper hits NJIT's Banner endpoints, parses the HTML response, and
 * writes objects matching these types as `public/data/<termCode>.json`. The
 * browser reads those files and renders them.
 *
 * Everything here is plain data — no methods, no classes — so the same
 * objects survive `JSON.stringify` → file → `fetch` → `JSON.parse` round-trip
 * without any custom serializer.
 */

/** Letter codes NJIT uses for days of the week in the sections table. */
export type DayCode = 'M' | 'T' | 'W' | 'R' | 'F' | 'S' | 'U';

/** A semester (e.g. `{ code: '202690', description: '2026 Fall' }`). */
export interface Term {
  /** Banner term code: YYYY + season digits (10 Spring / 50 Summer / 90 Fall / 95 Winter). */
  code: string;
  /** Human-readable label NJIT shows in the term dropdown. */
  description: string;
}

/**
 * One meeting time for a section. A section can have multiple meetings (e.g.
 * lecture + lab), but in NJIT's current data each row in the sections table
 * is a single meeting, so most sections end up with exactly one Meeting.
 *
 * Times are stored as minutes-from-midnight (0..1440) so the grid layout and
 * conflict math become plain integer comparisons — no Date parsing in the
 * hot path.
 */
export interface Meeting {
  days: DayCode[];
  /** Minutes from midnight, or `null` for TBA / async-online sections. */
  startMinutes: number | null;
  endMinutes: number | null;
  /** Building + room, e.g. "CKB 217". Empty string for online sections. */
  location: string;
}

export type SectionStatus = 'Open' | 'Closed';

/** A specific offering of a course (identified by its CRN). */
export interface Section {
  /** Course Reference Number — globally unique within a term, used for registration. */
  crn: string;
  /** Section number within the course, e.g. "001", "H01". */
  sectionNumber: string;
  status: SectionStatus;
  maxEnrollment: number;
  currentEnrollment: number;
  /** True when `currentEnrollment >= maxEnrollment`. May be true even when Status is "Open". */
  isFull: boolean;
  instructor: string;
  instructorProfileUrl: string | null;
  /** Raw mode string from NJIT (e.g. "Face-to-Face", "Online Virtual", "Converged Learning"). */
  deliveryMode: string;
  credits: string;
  meetings: Meeting[];
  comments: string;
  /**
   * True if this section was originally listed under an "<title> - HONORS"
   * variant of the same course code (e.g. "BIOL 200 - HONORS"). The honors
   * variants are merged into the base course in the scraper so they appear
   * together in the course browser; this flag lets the UI badge them.
   */
  isHonors: boolean;
}

/**
 * A catalog entry — a unique `(subject, number, title)` combination with all
 * of its sections.
 *
 * Note: NJIT sometimes lists the *same* (subject, number) twice in the catalog
 * when there are genuinely-different Special Topics offerings (e.g. ARCH 483
 * has nine distinct ST: titles). Those stay as separate Course objects so
 * each topic shows up in search. Honors variants are NOT separate Courses —
 * their sections are folded into the base course's `sections` list with
 * `isHonors: true`.
 */
export interface Course {
  subject: string;
  number: string;
  title: string;
  catalogUrl: string;
  sections: Section[];
}

/** One term's full data dump — the shape of `public/data/<termCode>.json`. */
export interface TermData {
  term: Term;
  /** ISO timestamp the scraper ran. Useful for "last updated" UI. */
  scrapedAt: string;
  /** Every subject offered this term (e.g. ["ACCT", "AD", "ARCH", ...]). */
  subjects: string[];
  /** Every course offered this term, flat list. Group by subject in the UI. */
  courses: Course[];
}
