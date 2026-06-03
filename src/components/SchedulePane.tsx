/**
 * Right-hand pane: the schedule grid, the off-grid list (weekend/TBA), and
 * the "Your sections" list with remove buttons and conflict callouts.
 *
 * The grid is laid out with a CSS grid (1 fixed-width time-axis column +
 * 5 equal-width day columns). Inside each day column, section blocks are
 * absolutely positioned: top = (startMinutes - gridStart)·pxPerHour/60,
 * height = duration·pxPerHour/60. Overlapping blocks within the same day
 * stack visually at the same x-rect — the conflict warning + amber ring
 * cue the user to look at the "Your sections" list for the full pair.
 *
 * Colors rotate from a fixed Tailwind palette so each selected section
 * gets a stable color across grid and selected-list.
 */

'use client';

import { useMemo } from 'react';
import {
  type Conflict,
  DAY_LABEL,
  DAY_LONG,
  formatDays,
  formatTime,
  formatTimeRange,
  gridHourRange,
  isOffGrid,
  placeSections,
  type SectionRef,
  WEEKDAYS,
} from '@/lib/schedule';

interface SchedulePaneProps {
  selectedRefs: SectionRef[];
  conflictMap: Map<string, Set<string>>;
  conflicts: Conflict[];
  onRemove: (crn: string) => void;
  onClearAll: () => void;
}

/**
 * Tailwind class strings (light + dark variants) for each color slot.
 * Sections are assigned a slot by their position in the selection list,
 * wrapping around if more than 8 are selected.
 */
const COLORS = [
  'bg-sky-100 border-sky-400 text-sky-900 dark:bg-sky-900/40 dark:border-sky-600 dark:text-sky-100',
  'bg-violet-100 border-violet-400 text-violet-900 dark:bg-violet-900/40 dark:border-violet-600 dark:text-violet-100',
  'bg-emerald-100 border-emerald-400 text-emerald-900 dark:bg-emerald-900/40 dark:border-emerald-600 dark:text-emerald-100',
  'bg-amber-100 border-amber-400 text-amber-900 dark:bg-amber-900/40 dark:border-amber-600 dark:text-amber-100',
  'bg-rose-100 border-rose-400 text-rose-900 dark:bg-rose-900/40 dark:border-rose-600 dark:text-rose-100',
  'bg-cyan-100 border-cyan-400 text-cyan-900 dark:bg-cyan-900/40 dark:border-cyan-600 dark:text-cyan-100',
  'bg-fuchsia-100 border-fuchsia-400 text-fuchsia-900 dark:bg-fuchsia-900/40 dark:border-fuchsia-600 dark:text-fuchsia-100',
  'bg-lime-100 border-lime-400 text-lime-900 dark:bg-lime-900/40 dark:border-lime-600 dark:text-lime-100',
];

export function SchedulePane({
  selectedRefs,
  conflictMap,
  conflicts,
  onRemove,
  onClearAll,
}: SchedulePaneProps) {
  // Flatten (section, meeting) pairs — a section with lecture+lab yields two.
  const placed = useMemo(() => placeSections(selectedRefs), [selectedRefs]);
  // Auto-widen the grid if any selected class falls outside 8 AM – 9 PM.
  const { startHour, endHour } = useMemo(() => gridHourRange(placed), [placed]);

  const colorByCrn = useMemo(() => {
    const map = new Map<string, string>();
    selectedRefs.forEach((ref, i) => {
      map.set(ref.section.crn, COLORS[i % COLORS.length]);
    });
    return map;
  }, [selectedRefs]);

  const onGrid = placed.filter((p) => !isOffGrid(p.meeting));
  const offGrid = placed.filter((p) => isOffGrid(p.meeting));

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <ScheduleGrid
        placed={onGrid}
        startHour={startHour}
        endHour={endHour}
        colorByCrn={colorByCrn}
        conflictMap={conflictMap}
      />

      {offGrid.length > 0 && (
        <section className="rounded border border-zinc-200 dark:border-zinc-800 p-3">
          <h3 className="text-sm font-semibold mb-2">
            Weekend / Async / TBA
          </h3>
          <ul className="text-xs space-y-1.5">
            {offGrid.map((p) => (
              <li
                key={`${p.section.crn}-${p.meeting.days.join('')}-${p.meeting.startMinutes}`}
                className="flex items-baseline gap-2"
              >
                <span className="font-mono font-medium">
                  {p.course.subject} {p.course.number}
                </span>
                <span>§{p.section.sectionNumber}</span>
                <span className="text-zinc-500">
                  {formatDays(p.meeting.days)}{' '}
                  {formatTimeRange(p.meeting.startMinutes, p.meeting.endMinutes)}
                </span>
                {p.meeting.location && (
                  <span className="text-zinc-500">· {p.meeting.location}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <SelectedList
        selectedRefs={selectedRefs}
        colorByCrn={colorByCrn}
        conflictMap={conflictMap}
        conflicts={conflicts}
        onRemove={onRemove}
        onClearAll={onClearAll}
      />
    </div>
  );
}

interface ScheduleGridProps {
  placed: ReturnType<typeof placeSections>;
  startHour: number;
  endHour: number;
  colorByCrn: Map<string, string>;
  conflictMap: Map<string, Set<string>>;
}

/** Pixel height of one hour row on the grid. Tweak to make blocks taller/shorter. */
const PX_PER_HOUR = 56;

/**
 * The Mon-Fri grid itself. Outer CSS grid creates the columns; each day
 * column is `position: relative` so the absolutely-positioned section
 * blocks layer inside it at the right pixel offset.
 */
function ScheduleGrid({
  placed,
  startHour,
  endHour,
  colorByCrn,
  conflictMap,
}: ScheduleGridProps) {
  const gridHeight = (endHour - startHour) * PX_PER_HOUR;

  // Bucket each placed meeting into the day columns it appears in. A
  // single MWF meeting becomes three entries — one per day column.
  const blocksByDay = new Map<string, typeof placed>();
  for (const day of WEEKDAYS) blocksByDay.set(day, []);
  for (const p of placed) {
    for (const day of p.meeting.days) {
      if (blocksByDay.has(day)) blocksByDay.get(day)!.push(p);
    }
  }

  return (
    <div className="rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden print:shadow-none">
      <div className="grid grid-cols-[56px_repeat(5,1fr)] text-xs">
        <div />
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="text-center font-semibold py-1.5 border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950"
            title={DAY_LONG[d]}
          >
            {DAY_LABEL[d]}
          </div>
        ))}

        <div className="relative" style={{ height: gridHeight }}>
          {Array.from({ length: endHour - startHour }).map((_, i) => (
            <div
              key={i}
              className="absolute right-1 text-[10px] text-zinc-400"
              style={{ top: i * PX_PER_HOUR - 6 }}
            >
              {formatTime((startHour + i) * 60).replace(':00', '')}
            </div>
          ))}
        </div>

        {WEEKDAYS.map((day) => {
          const blocks = blocksByDay.get(day) ?? [];
          return (
            <div
              key={day}
              className="relative border-l border-zinc-200 dark:border-zinc-800"
              style={{ height: gridHeight }}
            >
              {Array.from({ length: endHour - startHour }).map((_, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 border-t border-zinc-100 dark:border-zinc-800"
                  style={{ top: i * PX_PER_HOUR }}
                />
              ))}
              {blocks.map((p) => {
                // Convert (startMinutes, endMinutes) into pixel offsets
                // relative to the top of the day column. `start` and
                // `length` are in minutes; we divide by 60 to get hours
                // and multiply by PX_PER_HOUR. `-2` leaves a thin gap
                // between back-to-back classes; `Math.max(20, ...)`
                // keeps very short meetings legible.
                const start = p.meeting.startMinutes! - startHour * 60;
                const length = p.meeting.endMinutes! - p.meeting.startMinutes!;
                const top = (start / 60) * PX_PER_HOUR;
                const height = Math.max(20, (length / 60) * PX_PER_HOUR - 2);
                const hasConflict =
                  (conflictMap.get(p.section.crn)?.size ?? 0) > 0;

                // The block always uses its assigned rotating-palette color
                // so each course stays visually distinct. Closed/Full state
                // is communicated only by the corner pill — keeping the
                // block color stable means a Closed section still reads as
                // "the same class" across the grid.
                const isClosed = p.section.status === 'Closed';
                const isFull = !isClosed && p.section.isFull;
                const colorClasses = colorByCrn.get(p.section.crn) ?? COLORS[0];

                // Height-aware density. Required rows (code, location, time,
                // footer with enrollment/credits) always render. Optional
                // rows (course title, instructor) are revealed only when
                // there's room — a typical 80-min block fits four rows; the
                // title joins at ~110px, the instructor at ~130px.
                const showFooter = true;
                const showTitle = height >= 110;
                const showInstructor = height >= 130 && !!p.section.instructor;

                return (
                  <div
                    key={`${p.section.crn}-${day}`}
                    className={`absolute left-1 right-1 rounded-md border-2 px-2 py-1 flex flex-col gap-0.5 overflow-hidden ${colorClasses} ${
                      hasConflict ? 'ring-2 ring-amber-500 ring-offset-0' : ''
                    }`}
                    style={{ top, height }}
                    title={`${p.course.subject} ${p.course.number} – ${p.course.title}
§${p.section.sectionNumber} · CRN ${p.section.crn}
${formatTimeRange(p.meeting.startMinutes, p.meeting.endMinutes)}${
                      p.meeting.location ? '\n' + p.meeting.location : ''
                    }${
                      p.section.instructor ? '\n' + p.section.instructor : ''
                    }\n${p.section.currentEnrollment}/${p.section.maxEnrollment} enrolled · ${p.section.credits} cr${
                      isClosed ? '\nCLOSED' : isFull ? '\nFULL' : ''
                    }`}
                  >
                    {/* Header row: course code + status pill */}
                    <div className="flex items-start justify-between gap-1 leading-tight">
                      <div className="text-[13px] font-bold tracking-tight truncate">
                        {p.course.subject} {p.course.number}
                      </div>
                      {(isClosed || isFull) && (
                        <span
                          className={`shrink-0 text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${
                            isClosed
                              ? 'bg-red-600 text-white'
                              : 'bg-amber-600 text-white'
                          }`}
                        >
                          {isClosed ? 'Closed' : 'Full'}
                        </span>
                      )}
                    </div>

                    {showTitle && (
                      <div className="text-[11px] leading-tight truncate opacity-80">
                        {p.course.title}
                      </div>
                    )}

                    <div className="text-[11px] leading-tight truncate">
                      §{p.section.sectionNumber}
                      {p.meeting.location ? ` · ${p.meeting.location}` : ''}
                    </div>

                    <div className="text-[11px] leading-tight tabular-nums">
                      {formatTime(p.meeting.startMinutes!).replace(' ', '')}
                      –
                      {formatTime(p.meeting.endMinutes!).replace(' ', '')}
                    </div>

                    {showInstructor && (
                      <div className="text-[11px] leading-tight truncate opacity-80">
                        {p.section.instructor}
                      </div>
                    )}

                    {showFooter && (
                      // Footer row pinned to bottom — secondary info: seats
                      // filled and credit count. `mt-auto` pushes it down so
                      // the primary content stays anchored at the top.
                      <div className="mt-auto text-[10px] leading-tight tabular-nums opacity-75 flex items-center gap-1.5">
                        <span>
                          {p.section.currentEnrollment}/{p.section.maxEnrollment}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{p.section.credits} cr</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface SelectedListProps {
  selectedRefs: SectionRef[];
  colorByCrn: Map<string, string>;
  conflictMap: Map<string, Set<string>>;
  conflicts: Conflict[];
  onRemove: (crn: string) => void;
  onClearAll: () => void;
}

/**
 * Below-grid list summarizing each selected section: color swatch (matches
 * its grid block), course title, meeting details, instructor, mode,
 * credits, status, and any conflicts. Also renders a final amber callout
 * enumerating every conflicting pair so the user can act on it.
 */
function SelectedList({
  selectedRefs,
  colorByCrn,
  conflictMap,
  conflicts,
  onRemove,
  onClearAll,
}: SelectedListProps) {
  if (selectedRefs.length === 0) {
    return (
      <p className="text-sm text-zinc-500 italic">
        No sections yet. Pick courses from the list on the left.
      </p>
    );
  }
  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Your sections</h3>
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs text-zinc-500 hover:text-red-600 print:hidden"
        >
          Clear all
        </button>
      </div>
      <ul className="space-y-1.5">
        {selectedRefs.map(({ course, section }) => {
          const swatch = colorByCrn.get(section.crn) ?? '';
          const conflictsWith = [...(conflictMap.get(section.crn) ?? [])];
          return (
            <li
              key={section.crn}
              className="flex items-start gap-2 text-sm rounded border border-zinc-200 dark:border-zinc-800 p-2 bg-white dark:bg-zinc-900"
            >
              <span className={`mt-1 inline-block w-3 h-3 rounded-sm border ${swatch}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-mono font-medium">
                    {course.subject} {course.number}
                  </span>
                  <span className="truncate">{course.title}</span>
                  <span className="text-xs text-zinc-500">
                    §{section.sectionNumber} · CRN {section.crn}
                  </span>
                </div>
                <div className="text-xs text-zinc-600 dark:text-zinc-400 flex flex-wrap gap-x-3">
                  {section.meetings.map((m, i) => (
                    <span key={i}>
                      {formatDays(m.days)} {formatTimeRange(m.startMinutes, m.endMinutes)}
                      {m.location ? ` · ${m.location}` : ''}
                    </span>
                  ))}
                  <span>{section.instructor || 'TBA'}</span>
                  <span>{section.deliveryMode}</span>
                  <span>{section.credits} cr</span>
                  <span>
                    {section.status}
                    {section.isFull && section.status === 'Open' ? ' · Full' : ''}
                  </span>
                </div>
                {conflictsWith.length > 0 && (
                  <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                    ⚠ conflicts with {conflictsWith.join(', ')}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => onRemove(section.crn)}
                className="text-zinc-400 hover:text-red-600 text-sm print:hidden"
                aria-label="Remove section"
                title="Remove"
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>

      {conflicts.length > 0 && (
        <div className="mt-3 rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-2 text-xs">
          <div className="font-medium text-amber-800 dark:text-amber-300">
            ⚠ {conflicts.length} scheduling conflict{conflicts.length === 1 ? '' : 's'}
          </div>
          <ul className="mt-1 text-amber-900 dark:text-amber-200">
            {conflicts.map(({ a, b }) => (
              <li key={`${a.section.crn}-${b.section.crn}`}>
                {a.course.subject} {a.course.number} §{a.section.sectionNumber} overlaps {b.course.subject} {b.course.number} §{b.section.sectionNumber}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
