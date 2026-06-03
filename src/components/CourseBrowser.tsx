/**
 * Left-hand pane: search box, filter chips, subject dropdown, and the
 * collapsible list of all courses grouped by subject. Clicking a course
 * row expands it to show every section as a row with a checkbox.
 *
 * All filtering is in-memory (cheap on the ~1700-course Fall dataset).
 * The filter is composable — a section must pass the text query, subject
 * filter, delivery-mode chip set, "Open only" toggle, AND instructor
 * picker before it's included.
 *
 * Local state (expand/collapse + subject filter) lives here so the
 * top-level Scheduler doesn't need to know about it. The search query
 * and feature-filter chips DO live in Scheduler because they're shared
 * with future surfaces (e.g. shareable URL state, exports).
 */

'use client';

import { useMemo, useState } from 'react';
import type { Course, Section, TermData } from '@/lib/types';
import {
  deliveryBucket,
  type DeliveryBucket,
  formatDays,
  formatTimeRange,
  uniqueInstructors,
} from '@/lib/schedule';

export interface Filters {
  modes: DeliveryBucket[];
  openOnly: boolean;
  instructor: string;
}

const ALL_MODES: DeliveryBucket[] = ['Face-to-Face', 'Hybrid', 'Online', 'Other'];

interface CourseBrowserProps {
  termData: TermData;
  query: string;
  onQueryChange: (q: string) => void;
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  selectedCrns: string[];
  conflictMap: Map<string, Set<string>>;
  /**
   * Called when the user picks a section's radio button. The parent enforces
   * "one section per course" semantics: selecting a new section replaces any
   * previous pick in the same course, and re-clicking the chosen one
   * deselects it.
   */
  onSelectSection: (crn: string) => void;
}

export function CourseBrowser({
  termData,
  query,
  onQueryChange,
  filters,
  onFiltersChange,
  selectedCrns,
  conflictMap,
  onSelectSection,
}: CourseBrowserProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  // Subject explicitly picked from the dropdown. Empty string = no pick.
  const [subjectFilter, setSubjectFilter] = useState<string>('');

  const instructors = useMemo(() => uniqueInstructors(termData.courses), [termData]);

  // Parse the search box into a subject prefix + number prefix. Typing
  // overrides the dropdown so a user can switch subjects without touching it.
  const parsed = useMemo(() => parseQuery(query), [query]);
  const effectiveSubjectPrefix = parsed.subjectPrefix || subjectFilter;
  const numberPrefix = parsed.numberPrefix;
  // Nothing to filter on → render the empty-state hint instead of all courses.
  const hasSubjectScope = effectiveSubjectPrefix.length > 0;

  const filtered = useMemo(() => {
    if (!hasSubjectScope) return [];

    const subjPrefix = effectiveSubjectPrefix.toUpperCase();

    return termData.courses
      .filter((c) => c.subject.startsWith(subjPrefix))
      .filter((c) => (numberPrefix ? c.number.startsWith(numberPrefix) : true))
      .map((course) => ({
        course,
        sections: course.sections.filter((s) => sectionMatches(s, filters)),
      }))
      .filter((entry) => entry.sections.length > 0);
  }, [termData, hasSubjectScope, effectiveSubjectPrefix, numberPrefix, filters]);

  const groupedBySubject = useMemo(() => {
    const groups = new Map<string, { course: Course; sections: Section[] }[]>();
    for (const entry of filtered) {
      if (!groups.has(entry.course.subject)) groups.set(entry.course.subject, []);
      groups.get(entry.course.subject)!.push(entry);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 bg-zinc-50/95 dark:bg-zinc-950/95 backdrop-blur border-b border-zinc-200 dark:border-zinc-800 p-3 space-y-2 z-10">
        <input
          type="search"
          placeholder="Search course (e.g. MATH 337, CS 100)"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-2">
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="flex-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5 text-sm"
          >
            {/* Default placeholder: no subject picked = no courses shown. */}
            <option value="">Select subject…</option>
            {termData.subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={filters.instructor}
            onChange={(e) =>
              onFiltersChange({ ...filters, instructor: e.target.value })
            }
            className="flex-1 min-w-0 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5 text-sm"
          >
            <option value="">All instructors</option>
            {instructors.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {ALL_MODES.map((m) => {
            const on = filters.modes.includes(m);
            return (
              <button
                key={m}
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    modes: on
                      ? filters.modes.filter((x) => x !== m)
                      : [...filters.modes, m],
                  })
                }
                className={`px-2 py-1 rounded-full border transition ${
                  on
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-400'
                }`}
                type="button"
              >
                {m}
              </button>
            );
          })}
          <button
            onClick={() => onFiltersChange({ ...filters, openOnly: !filters.openOnly })}
            className={`px-2 py-1 rounded-full border transition ${
              filters.openOnly
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-400'
            }`}
            type="button"
          >
            Open only
          </button>
          {(filters.modes.length > 0 || filters.openOnly || filters.instructor) && (
            <button
              onClick={() => onFiltersChange(DEFAULT_FILTERS)}
              className="px-2 py-1 rounded-full text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              type="button"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="text-xs text-zinc-500 px-3 pt-2">
        {hasSubjectScope
          ? `${filtered.length} course${filtered.length === 1 ? '' : 's'} match`
          : 'Pick a subject to browse'}
      </div>

      <div className="px-1 py-2">
        {groupedBySubject.map(([subject, entries]) => (
          <section key={subject} className="mb-3">
            {/* Brand accent: a 2px NJIT-red bar to the left of each subject
                heading. Subtle in a dense list — present, not loud. */}
            <h2 className="text-xs font-bold tracking-wider text-zinc-600 dark:text-zinc-300 px-3 py-1 border-l-2 border-njit-red ml-1">
              {subject}
            </h2>
            <ul>
              {entries.map(({ course, sections }) => {
                // Include the title in the key so that two distinct catalog
                // entries with the same (subject, number) — e.g. ARCH 483's
                // multiple Special Topics offerings — get unique React keys.
                // The expand-state map is keyed identically.
                const key = `${course.subject} ${course.number} ${course.title}`;
                const isOpen = expanded.has(key);
                const anySelected = sections.some((s) => selectedCrns.includes(s.crn));
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(key)}
                      className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded ${
                        anySelected ? 'font-medium' : ''
                      }`}
                    >
                      <span className="text-zinc-400 text-xs w-3">
                        {isOpen ? '▾' : '▸'}
                      </span>
                      <span className="font-mono text-xs text-zinc-500">
                        {course.subject} {course.number}
                      </span>
                      <span className="truncate">{course.title}</span>
                      <span className="ml-auto text-xs text-zinc-400">
                        {sections.length}
                      </span>
                    </button>
                    {isOpen && (
                      <ul className="pl-6 pr-2 pb-2 space-y-1">
                        {sections.map((section) => (
                          <SectionRow
                            key={section.crn}
                            course={course}
                            section={section}
                            /* All sections of the same course entry share a
                               `name`, which is what makes the inputs behave
                               as a mutually-exclusive radio group. */
                            groupName={`course-${key}`}
                            isSelected={selectedCrns.includes(section.crn)}
                            hasConflict={(conflictMap.get(section.crn)?.size ?? 0) > 0}
                            onSelect={() => onSelectSection(section.crn)}
                          />
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {!hasSubjectScope && (
          // Initial / cleared state — guide the user to the two entry points.
          <p className="px-3 py-8 text-sm text-zinc-500">
            Pick a subject from the dropdown, or start typing a course code
            in the search box — e.g. <span className="font-mono">MATH 337</span> or{' '}
            <span className="font-mono">CS 100</span>.
          </p>
        )}
        {hasSubjectScope && filtered.length === 0 && (
          <p className="px-3 py-6 text-sm text-zinc-500">
            No courses match. Try a different code or clear your filters.
          </p>
        )}
      </div>
    </div>
  );
}

const DEFAULT_FILTERS: Filters = { modes: [], openOnly: false, instructor: '' };

/**
 * Section-level filter — applied AFTER the course-level subject + number
 * narrowing. Returns true iff this section passes every active filter chip:
 * "Open only", delivery-mode chips, instructor picker.
 */
function sectionMatches(section: Section, filters: Filters): boolean {
  if (filters.openOnly && section.status === 'Closed') return false;
  if (filters.instructor && section.instructor !== filters.instructor) return false;
  if (filters.modes.length > 0 && !filters.modes.includes(deliveryBucket(section.deliveryMode)))
    return false;
  return true;
}

/**
 * Parse the search box into a `(subjectPrefix, numberPrefix)` pair.
 *
 * Students search the way they say a course name: "MATH 337", "Math 3",
 * "CS 100", "Phys" — letters first (subject), digits after (course number).
 * Either part can be missing; whitespace between them is optional.
 *
 * Examples:
 *   "MATH 337" → { subjectPrefix: "MATH", numberPrefix: "337" }
 *   "Math 3"   → { subjectPrefix: "MATH", numberPrefix: "3" }
 *   "Math"     → { subjectPrefix: "MATH", numberPrefix: "" }
 *   "math337"  → { subjectPrefix: "MATH", numberPrefix: "337" }
 *   "337"      → { subjectPrefix: "",     numberPrefix: "337" }
 *   ""         → { subjectPrefix: "",     numberPrefix: "" }
 */
function parseQuery(q: string): { subjectPrefix: string; numberPrefix: string } {
  const trimmed = q.trim().toUpperCase();
  if (!trimmed) return { subjectPrefix: '', numberPrefix: '' };
  const m = trimmed.match(/^([A-Z]+)\s*(\S.*)?$/);
  if (m) {
    return {
      subjectPrefix: m[1],
      numberPrefix: (m[2] ?? '').trim(),
    };
  }
  // Pure-digit (or symbol) query → treat the whole thing as a number prefix.
  return { subjectPrefix: '', numberPrefix: trimmed };
}

interface SectionRowProps {
  course: Course;
  section: Section;
  /** Shared by every section under the same course, makes radios mutually exclusive. */
  groupName: string;
  isSelected: boolean;
  hasConflict: boolean;
  onSelect: () => void;
}

/**
 * One row in the expanded section list. Renders a radio button (only one
 * section per course can be picked) plus a dense summary: section #,
 * optional Honors badge, CRN, status, conflict warning, day/time/location,
 * instructor (linked to their NJIT profile when available), delivery mode,
 * credits, enrollment ratio.
 *
 * We intercept `onClick` (not `onChange`) so that clicking the already-
 * selected radio fires our handler too — the parent uses that to deselect.
 * A no-op `onChange` keeps React's controlled-input contract happy.
 */
function SectionRow({
  course,
  section,
  groupName,
  isSelected,
  hasConflict,
  onSelect,
}: SectionRowProps) {
  const statusColor =
    section.status === 'Closed'
      ? 'text-red-600 dark:text-red-400'
      : section.isFull
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-emerald-700 dark:text-emerald-400';
  return (
    <li
      className={`text-xs rounded border p-2 ${
        isSelected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
          : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
      }`}
    >
      <div className="flex items-start gap-2">
        <input
          type="radio"
          name={groupName}
          checked={isSelected}
          onChange={() => {}}
          onClick={onSelect}
          className="mt-0.5 accent-blue-600"
          aria-label={`Select section ${section.sectionNumber} (CRN ${section.crn})`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-medium">§{section.sectionNumber}</span>
            {section.isHonors && (
              // Honors variants are folded into the base course by the
              // scraper's mergeHonorsVariants step; the badge tells the
              // student this specific section is the honors offering.
              <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200">
                Honors
              </span>
            )}
            <span className="text-zinc-500">CRN {section.crn}</span>
            <span className={statusColor}>
              {section.status}
              {section.isFull && section.status === 'Open' ? ' · Full' : ''}
            </span>
            {hasConflict && isSelected && (
              <span className="text-amber-600 dark:text-amber-400">⚠ conflict</span>
            )}
          </div>
          {/* One line per meeting — matches NJIT's per-row layout for sections
              that meet at multiple day/time slots (e.g. T in KUPF 210, F in GITC 1400). */}
          <div className="text-zinc-700 dark:text-zinc-300 mt-0.5 space-y-0.5">
            {section.meetings.length === 0 ? (
              <div>TBA</div>
            ) : (
              section.meetings.map((m, i) => (
                <div key={i}>
                  {formatDays(m.days)} {formatTimeRange(m.startMinutes, m.endMinutes)}
                  {m.location ? ` · ${m.location}` : ''}
                </div>
              ))
            )}
          </div>
          <div className="text-zinc-500 flex flex-wrap gap-x-3 mt-0.5">
            <span>
              {section.instructor ? (
                section.instructorProfileUrl ? (
                  <a
                    href={section.instructorProfileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline"
                  >
                    {section.instructor}
                  </a>
                ) : (
                  section.instructor
                )
              ) : (
                'TBA'
              )}
            </span>
            <span>{section.deliveryMode || '—'}</span>
            <span>{section.credits} cr</span>
            <span>
              {section.currentEnrollment}/{section.maxEnrollment}
            </span>
          </div>
          {/* keep course title accessible for screen readers when section is shown alone */}
          <span className="sr-only">
            {course.subject} {course.number} {course.title}
          </span>
        </div>
      </div>
    </li>
  );
}
