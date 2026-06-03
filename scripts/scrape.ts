/**
 * Build-time scraper: pulls the latest course data from NJIT and writes
 * normalized JSON files into `public/data/`. Run with `npm run scrape`.
 *
 * Sequence per invocation:
 *   1. fetchTerms() → take the N newest terms (default 2)
 *   2. Write `public/data/terms.json` (the term picker uses this).
 *   3. For each term:
 *      a. fetchSubjects(term) → list of subject codes
 *      b. For each subject, in parallel (CONCURRENCY workers):
 *         fetchSectionsHtml(term, subject) → big HTML blob
 *         parseSectionsHtml(html)          → Course[] with honors merged
 *      c. Flatten, write `public/data/<termCode>.json`.
 *
 * Tunable via env vars: `TERMS=N` (number of newest terms),
 * `CONCURRENCY=N` (parallel subject fetches per term).
 *
 * This script is intended to run from a GitHub Actions cron — its output
 * (the JSON files) is committed back to the repo, which triggers a Vercel
 * deploy. No live backend is required.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import pLimit from 'p-limit';
import {
  fetchSectionsHtml,
  fetchSubjects,
  fetchTerms,
} from '../src/lib/njit';
import { parseSectionsHtml } from '../src/lib/parse-sections';
import type { Course, TermData } from '../src/lib/types';

const TERMS_TO_SCRAPE = Number(process.env.TERMS ?? 2);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);
const OUT_DIR = join(process.cwd(), 'public', 'data');

async function scrapeTerm(termCode: string, termDesc: string): Promise<TermData> {
  console.log(`[${termCode}] ${termDesc} — fetching subjects`);
  const subjects = await fetchSubjects(termCode);
  console.log(`[${termCode}] ${subjects.length} subjects`);

  const limit = pLimit(CONCURRENCY);
  let done = 0;

  const perSubject = await Promise.all(
    subjects.map((subj) =>
      limit(async () => {
        const html = await fetchSectionsHtml(termCode, subj);
        const courses = parseSectionsHtml(html);
        done += 1;
        const totalSections = courses.reduce((n, c) => n + c.sections.length, 0);
        console.log(
          `[${termCode}] (${done}/${subjects.length}) ${subj}: ${courses.length} courses, ${totalSections} sections`,
        );
        return courses;
      }),
    ),
  );

  const courses: Course[] = perSubject.flat();

  return {
    term: { code: termCode, description: termDesc },
    scrapedAt: new Date().toISOString(),
    subjects,
    courses,
  };
}

async function writeTermsIndex(terms: { code: string; description: string }[]) {
  const path = join(OUT_DIR, 'terms.json');
  await writeFile(path, JSON.stringify(terms, null, 2));
  console.log(`wrote ${path}`);
}

async function writeTermData(data: TermData) {
  const path = join(OUT_DIR, `${data.term.code}.json`);
  const json = JSON.stringify(data);
  await writeFile(path, json);
  console.log(`wrote ${path} (${data.courses.length} courses, ${(json.length / 1024).toFixed(0)} KB)`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const allTerms = await fetchTerms();
  const newest = allTerms.slice(0, TERMS_TO_SCRAPE);
  console.log(
    `scraping ${newest.length} terms: ${newest.map((t) => `${t.code} (${t.description})`).join(', ')}`,
  );

  await writeTermsIndex(newest);

  for (const t of newest) {
    const data = await scrapeTerm(t.code, t.description);
    await writeTermData(data);
  }

  console.log('done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
