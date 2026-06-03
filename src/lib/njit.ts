/**
 * HTTP client for NJIT's Banner Extensibility "virtualDomain" endpoints.
 * These are the same JSON services the public course-schedule page
 * (`generalssb-prod.ec.njit.edu/.../stuRegCrseSched`) calls under the hood.
 *
 * They have no auth/cookie/CORS requirements when called from a server, so
 * this module is invoked by the build-time scraper (`scripts/scrape.ts`)
 * and writes its output to `public/data/`. The browser never calls these
 * URLs directly — it only ever fetches the pre-baked JSON files.
 *
 * The three endpoints we use, with the `attr` token each one expects:
 *   - stuRegCrseSchedTermSelect      (no params)        → list of terms
 *   - stuRegCrseSchedSubjList        (attr=21)          → subjects for a term
 *   - stuRegCrseSchedSections        (attr=12)          → all sections for a (term, subject) as HTML
 *
 * ─── About the param-encoding obfuscation ─────────────────────────────────
 * NJIT's endpoints reject normal `?term=202690` query strings when
 * `encoded=true` is set (and `encoded=true` is mandatory). Instead each
 * (name, value) pair must be base64-disguised in a specific way that we
 * reverse-engineered empirically:
 *
 *   Param name: <junk-b64><base64(name)>           — e.g. `MA==dGVybQ==`
 *   Param value (for `attr`):     <base64(value)>  — NO junk prefix
 *   Param value (everything else): <junk-b64><base64(value)>
 *
 * The junk prefix can be any valid base64 string (we use `MA==`, i.e. b64
 * of "0", because it's short and stable). Adding a junk prefix to the
 * `attr` value specifically breaks the request — reason unknown, but
 * reproducible. See `buildEncodedUrl` below.
 */

import type { Term } from './types';

const BASE =
  'https://generalssb-prod.ec.njit.edu/BannerExtensibility/internalPb';
const REFERER =
  'https://generalssb-prod.ec.njit.edu/BannerExtensibility/customPage/page/stuRegCrseSched';

/**
 * Junk base64 prefix used to wrap every param name (and most values).
 * Any valid base64 string works; "MA==" is base64 of "0" — shortest stable choice.
 */
const JUNK = 'MA==';

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64');

/**
 * Build a URL with all params encoded per NJIT's `encoded=true` scheme.
 * See the file header for the rules.
 */
function buildEncodedUrl(
  endpoint: string,
  params: Record<string, string>,
): string {
  const url = new URL(`${BASE}/${endpoint}`);
  for (const [name, value] of Object.entries(params)) {
    const key = JUNK + b64(name);
    // `attr` is the one field that MUST be sent bare — adding a prefix
    // causes the server to silently return an empty array.
    const val = name === 'attr' ? b64(value) : JUNK + b64(value);
    url.searchParams.append(key, val);
  }
  // Mandatory marker telling the server the params are obfuscated.
  url.searchParams.append('encoded', 'true');
  return url.toString();
}

/** GET a URL and decode its JSON body, surfacing HTTP errors. */
async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      accept: 'application/json, text/plain, */*',
      // NJIT doesn't strictly require Referer, but sending it makes our
      // requests indistinguishable from the legit AngularJS frontend.
      referer: REFERER,
      'user-agent':
        'Mozilla/5.0 (compatible; njit-course-scheduler-scraper)',
    },
  });
  if (!res.ok) {
    throw new Error(`NJIT ${endpointOf(url)} -> HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

function endpointOf(url: string): string {
  return new URL(url).pathname.split('/').pop() ?? url;
}

// ────────────────────────────────────────────────────────────────────────────
// Public fetchers — one per Banner virtualDomain we use
// ────────────────────────────────────────────────────────────────────────────

/**
 * Fetch the list of available terms, already sorted most-recent-first by NJIT.
 * Take `.slice(0, 2)` to get "two most recent terms" per the app's product spec.
 */
export async function fetchTerms(): Promise<Term[]> {
  const url = `${BASE}/virtualDomains.stuRegCrseSchedTermSelect?encoded=true`;
  const rows = await fetchJson<Array<{ TERM: string; TERM_DESC: string }>>(url);
  return rows.map((r) => ({ code: r.TERM, description: r.TERM_DESC }));
}

/** Fetch all subject codes offered in a given term (e.g. ["ACCT", "AD", "ARCH", ...]). */
export async function fetchSubjects(termCode: string): Promise<string[]> {
  const url = buildEncodedUrl('virtualDomains.stuRegCrseSchedSubjList', {
    offset: '0',
    max: '9999',
    attr: '21',
    term: termCode,
  });
  const rows = await fetchJson<Array<{ SUBJECT: string }>>(url);
  return rows.map((r) => r.SUBJECT);
}

/**
 * Fetch the giant HTML blob containing all courses + sections for one
 * (term, subject) pair. The response is always a single-element array
 * `[{ SECTIONS_TABLE: "<h4>...<table>...</table>..." }]`. Returns an
 * empty string when the subject has no offerings.
 */
export async function fetchSectionsHtml(
  termCode: string,
  subject: string,
): Promise<string> {
  const url = buildEncodedUrl('virtualDomains.stuRegCrseSchedSections', {
    offset: '0',
    max: '9999',
    attr: '12',
    term: termCode,
    subject,
  });
  const rows = await fetchJson<Array<{ SECTIONS_TABLE: string }>>(url);
  return rows[0]?.SECTIONS_TABLE ?? '';
}
