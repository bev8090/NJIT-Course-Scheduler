/**
 * Dropdown in the header offering "Print schedule" and "Download .ics".
 * Print triggers the browser's print dialog (CSS in globals.css hides
 * the chrome and lets the grid fill the page). The .ics action builds
 * the iCal file in-memory and triggers a download — see `lib/ical.ts`
 * for the file format.
 */

'use client';

import { useState } from 'react';
import { buildIcs, downloadIcs, termGuessDates } from '@/lib/ical';
import type { SectionRef } from '@/lib/schedule';
import type { Term } from '@/lib/types';

interface ExportMenuProps {
  term: Term | null;
  selectedRefs: SectionRef[];
  disabled: boolean;
}

export function ExportMenu({ term, selectedRefs, disabled }: ExportMenuProps) {
  const [open, setOpen] = useState(false);

  const handlePrint = () => {
    setOpen(false);
    window.print();
  };

  const handleIcs = () => {
    if (!term) return;
    setOpen(false);
    const { start, end } = termGuessDates(term.code);
    const ics = buildIcs(selectedRefs, {
      termCode: term.code,
      termDescription: term.description,
      termStart: start,
      termEnd: end,
    });
    downloadIcs(`njit-${term.code}.ics`, ics);
  };

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        /* Primary action: NJIT-red filled button when enabled. When disabled
           (no sections picked yet) it reverts to a neutral ghost button so
           the brand red only appears when the action is actually meaningful. */
        className={
          disabled
            ? 'rounded border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs bg-white dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
            : 'rounded px-3 py-1.5 text-xs font-medium bg-njit-red text-white hover:bg-njit-red-hover transition-colors focus:outline-none focus:ring-2 focus:ring-njit-red focus:ring-offset-2 dark:focus:ring-offset-zinc-900'
        }
      >
        Export ▾
      </button>
      {open && (
        <div
          className="absolute right-0 mt-1 z-20 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg text-sm w-48"
          onMouseLeave={() => setOpen(false)}
        >
          <button
            type="button"
            onClick={handlePrint}
            className="block w-full text-left px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Print schedule
          </button>
          <button
            type="button"
            onClick={handleIcs}
            className="block w-full text-left px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Download .ics (calendar)
          </button>
        </div>
      )}
    </div>
  );
}
