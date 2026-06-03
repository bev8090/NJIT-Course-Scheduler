/**
 * Top-level client component for the whole scheduler UI.
 *
 * Owns ALL state: which term is picked, the loaded course catalog, the
 * selected CRNs, the search query, the filter chips. Children are
 * presentational — they receive props and call callbacks; they don't
 * read state directly.
 *
 * Data flow on first load:
 *   1. Fetch `/data/terms.json` (tiny — list of available terms).
 *   2. Pick the saved term from localStorage, or default to the first one.
 *   3. Fetch `/data/<termCode>.json` (the big catalog, lazily — only the
 *      currently-shown term is downloaded).
 *   4. Hydrate the selection from localStorage for that term.
 *   5. Save selection back to localStorage on every change.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Course, Section, Term, TermData } from '@/lib/types';
import {
  conflictsByCrn,
  findConflicts,
  type SectionRef,
  totalCredits,
} from '@/lib/schedule';
import {
  loadSelectedCrns,
  loadSelectedTerm,
  saveSelectedCrns,
  saveSelectedTerm,
} from '@/lib/storage';
import { CourseBrowser, type Filters } from './CourseBrowser';
import { SchedulePane } from './SchedulePane';

const DEFAULT_FILTERS: Filters = {
  modes: [],
  openOnly: false,
  instructor: '',
};

export function Scheduler() {
  // ─── State ────────────────────────────────────────────────────────────
  const [terms, setTerms] = useState<Term[] | null>(null);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [termCode, setTermCode] = useState<string | null>(null);
  const [termData, setTermData] = useState<TermData | null>(null);
  const [termDataLoading, setTermDataLoading] = useState(false);
  const [selectedCrns, setSelectedCrns] = useState<string[]>([]);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [query, setQuery] = useState('');

  // ─── Load terms list once on mount ────────────────────────────────────
  // After we know what's available we pick a term (saved-in-localStorage
  // if it still exists, otherwise the most-recent term).
  useEffect(() => {
    let cancelled = false;
    fetch('/data/terms.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Term[]>;
      })
      .then((rows) => {
        if (cancelled) return;
        setTerms(rows);
        const saved = loadSelectedTerm();
        const chosen =
          (saved && rows.find((t) => t.code === saved)?.code) ?? rows[0]?.code ?? null;
        setTermCode(chosen);
      })
      .catch((err) => {
        if (!cancelled) setTermsError(String(err.message ?? err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Load the catalog for whatever term is currently picked ───────────
  // Runs again whenever the user changes the term dropdown. The `cancelled`
  // flag prevents a slower previous fetch from overwriting state when the
  // user switches terms rapidly.
  useEffect(() => {
    if (!termCode) return;
    saveSelectedTerm(termCode);
    setSelectedCrns(loadSelectedCrns(termCode));
    setTermData(null);
    setTermDataLoading(true);
    let cancelled = false;
    fetch(`/data/${termCode}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<TermData>;
      })
      .then((data) => {
        if (cancelled) return;
        setTermData(data);
        setTermDataLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setTermsError(`Failed to load term data: ${err.message ?? err}`);
          setTermDataLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [termCode]);

  // ─── Persist selection on every change ────────────────────────────────
  useEffect(() => {
    if (!termCode) return;
    saveSelectedCrns(termCode, selectedCrns);
  }, [termCode, selectedCrns]);

  // ─── Derived state ────────────────────────────────────────────────────
  // Build a CRN → (course, section) index once per term-data change so
  // looking up a selected CRN is O(1). This is the only place we walk
  // the full catalog from the React tree.
  const crnToRef = useMemo(() => {
    const map = new Map<string, { course: Course; section: Section }>();
    if (!termData) return map;
    for (const course of termData.courses) {
      for (const section of course.sections) {
        map.set(section.crn, { course, section });
      }
    }
    return map;
  }, [termData]);

  // Resolve the saved CRN list into rich (course, section) refs. CRNs that
  // don't exist in the catalog (e.g. dropped from a future scrape) are
  // silently skipped so stale localStorage doesn't crash the UI.
  const selectedRefs: SectionRef[] = useMemo(
    () =>
      selectedCrns
        .map((crn) => crnToRef.get(crn))
        .filter((r): r is SectionRef => r != null),
    [selectedCrns, crnToRef],
  );

  const conflicts = useMemo(() => findConflicts(selectedRefs), [selectedRefs]);
  const conflictMap = useMemo(() => conflictsByCrn(conflicts), [conflicts]);
  const credits = useMemo(() => totalCredits(selectedRefs), [selectedRefs]);

  // ─── Mutation callbacks (passed to children) ──────────────────────────
  /**
   * Radio-style "one section per course" selection used by the course
   * browser. Clicking a different section in the same course replaces the
   * old pick; clicking the currently-selected section deselects it (so a
   * course can be returned to "no section picked" without going through
   * the SelectedList sidebar).
   */
  const selectSection = useCallback(
    (crn: string) => {
      setSelectedCrns((prev) => {
        const ref = crnToRef.get(crn);
        if (!ref) return prev;
        // Build the CRN set of every section under the same course entry.
        const sameCourseCrns = new Set(ref.course.sections.map((s) => s.crn));
        const withoutCourse = prev.filter((c) => !sameCourseCrns.has(c));
        // Re-click on the chosen one toggles it off.
        if (prev.includes(crn)) return withoutCourse;
        return [...withoutCourse, crn];
      });
    },
    [crnToRef],
  );

  const removeCrn = useCallback((crn: string) => {
    setSelectedCrns((prev) => prev.filter((c) => c !== crn));
  }, []);

  const clearAll = useCallback(() => setSelectedCrns([]), []);

  // ─── Render ───────────────────────────────────────────────────────────
  if (termsError && !terms) {
    return (
      <div className="p-8 text-red-600">
        Failed to load term list: {termsError}
      </div>
    );
  }

  if (!terms || !termCode) {
    return <div className="p-8 text-sm text-zinc-500">Loading terms…</div>;
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <Header
        terms={terms}
        termCode={termCode}
        onTermChange={setTermCode}
        credits={credits}
        conflictCount={conflicts.length}
        selectedCount={selectedRefs.length}
        selectedRefs={selectedRefs}
        termData={termData}
      />

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
        <aside className="w-full lg:w-[420px] lg:min-w-[360px] lg:max-w-[460px] border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto bg-zinc-50/50 dark:bg-zinc-950/50">
          {termDataLoading || !termData ? (
            <div className="p-6 text-sm text-zinc-500">Loading courses…</div>
          ) : (
            <CourseBrowser
              termData={termData}
              query={query}
              onQueryChange={setQuery}
              filters={filters}
              onFiltersChange={setFilters}
              selectedCrns={selectedCrns}
              conflictMap={conflictMap}
              onSelectSection={selectSection}
            />
          )}
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto">
          <SchedulePane
            selectedRefs={selectedRefs}
            conflictMap={conflictMap}
            conflicts={conflicts}
            onRemove={removeCrn}
            onClearAll={clearAll}
          />
        </main>
      </div>
    </div>
  );
}

import { ExportMenu } from './ExportMenu';

/**
 * Top bar: app title, term dropdown, total-credits + selected-section
 * counter, conflict warning when applicable, and the Export menu.
 * `print:hidden` makes the entire bar disappear on print so the schedule
 * fills the page.
 */
function Header(props: {
  terms: Term[];
  termCode: string;
  onTermChange: (code: string) => void;
  credits: number;
  conflictCount: number;
  selectedCount: number;
  selectedRefs: SectionRef[];
  termData: TermData | null;
}) {
  const term = props.terms.find((t) => t.code === props.termCode);
  return (
    <header className="flex flex-wrap items-center gap-4 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 print:hidden border-t-[3px] border-t-njit-red">
      {/* The 3px top stripe (border-t-njit-red above) is the primary brand
          touchpoint. The "NJIT" prefix in the title reinforces it. */}
      <div className="flex items-baseline gap-1.5">
        <h1 className="text-base font-semibold tracking-tight">
          <span className="text-njit-red">NJIT</span>{' '}
          <span className="text-zinc-900 dark:text-zinc-100">Schedule Builder</span>
        </h1>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <span className="text-zinc-500">Term:</span>
        <select
          value={props.termCode}
          onChange={(e) => props.onTermChange(e.target.value)}
          className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {props.terms.map((t) => (
            <option key={t.code} value={t.code}>
              {t.description}
            </option>
          ))}
        </select>
      </label>

      <div className="ml-auto flex items-center gap-4 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {props.selectedCount}
          </span>{' '}
          section{props.selectedCount === 1 ? '' : 's'} ·{' '}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {props.credits}
          </span>{' '}
          cr
        </span>
        {props.conflictCount > 0 && (
          <span className="text-amber-700 dark:text-amber-400 font-medium">
            ⚠ {props.conflictCount} conflict{props.conflictCount === 1 ? '' : 's'}
          </span>
        )}
        <ExportMenu
          term={term ?? null}
          selectedRefs={props.selectedRefs}
          disabled={props.selectedCount === 0}
        />
      </div>
    </header>
  );
}
