/**
 * localStorage wrappers for the per-browser schedule state.
 *
 * The app intentionally has no login and no server-side persistence — a
 * student's schedule lives only in their browser. We store two things:
 *
 *   `njit-scheduler:term`               → the last-selected term code
 *   `njit-scheduler:selection:<term>`   → JSON array of selected CRNs for that term
 *
 * Each function is defensive: `typeof window === 'undefined'` guards make
 * them safe to import from server components (where they no-op), and the
 * try/catch handles browsers that throw on localStorage access (private
 * mode / quota exceeded / disabled storage).
 */

const TERM_KEY = 'njit-scheduler:term';
const SELECTION_KEY = (term: string) => `njit-scheduler:selection:${term}`;

export function loadSelectedTerm(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TERM_KEY);
  } catch {
    return null;
  }
}

export function saveSelectedTerm(term: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TERM_KEY, term);
  } catch {
    /* private mode / quota — silently drop */
  }
}

/**
 * Read the saved CRN list for a term. Returns [] if nothing is saved,
 * the JSON is corrupt, or the value isn't an array of strings.
 */
export function loadSelectedCrns(term: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SELECTION_KEY(term));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === 'string')
      : [];
  } catch {
    return [];
  }
}

export function saveSelectedCrns(term: string, crns: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SELECTION_KEY(term), JSON.stringify(crns));
  } catch {
    /* ignore */
  }
}
