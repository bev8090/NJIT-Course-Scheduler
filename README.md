<p align="center">
  <img src="src/app/icon.svg" alt="NJIT Course Scheduler+ logo" width="96" height="96" />
</p>

<h1 align="center">NJIT Course Scheduler+</h1>

<p align="center">
  A faster, friendlier way for NJIT students to plan a semester.<br />
  Browse every course, build a visual weekly schedule, catch time conflicts, and export to your calendar. No sign-in required.
</p>

<p align="center">
  <a href="https://njitplanner.com/"><strong>🌐 Open the app at njitplanner.com</strong></a>
</p>

<p align="center">
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
  <img alt="Tailwind CSS 4" src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white" />
  <img alt="Data refresh" src="https://img.shields.io/badge/course_data-refreshed_every_3h-cc0033" />
</p>

---

## Why this exists

During registration, NJIT students plan with the official **Weekly Schedule Planner**. You pick a term, add courses one at a time, and see them on a weekly calendar. It works, but it has real gaps when you're comparing sections:

- **Your plan disappears.** Nothing is saved, so refreshing the page or closing the tab erases everything you added.
- **Key section details are missing.** Enrollment numbers and credits aren't shown for the courses you add, so you can't tell how close a section is to full or how many credits your plan adds up to.
- **You need to know what you're looking for.** Courses are added through a single text box, with no way to browse a subject or filter sections.

**NJIT Course Scheduler+** uses the same official course data and is built around those gaps.

| | Weekly Schedule Planner | **Scheduler+** |
| --- | :---: | :---: |
| Pick a term and add courses | ✅ | ✅ |
| See your classes on a weekly calendar | ✅ | ✅ |
| Plan survives a refresh or a closed tab | — | ✅ |
| Enrollment numbers (seats taken / max) for each section | — | ✅ |
| Credits for each section, plus a running total | — | ✅ |
| Browse a whole subject and filter by delivery mode, open seats, or instructor | — | ✅ |
| Export to Google / Apple / Outlook calendar (`.ics`) | — | ✅ |
| Dark mode | — | ✅ |

Scheduler+ also adds time-conflict warnings and a clean printable schedule. All of it works without signing in.

---

## Features

### 🔎 Find courses fast
- **Smart search.** Type a course the way you'd say it: `MATH 337`, `Math 3`, `math337`, `CS`, or just `337`. The subject and course-number parts are matched as prefixes, so results narrow as you type.
- **Subject dropdown.** Browse a whole department (e.g. `PHYS`, `ECE`, `HIST`) without typing.
- **Composable filters:**
  - **Delivery mode** chips: *Face-to-Face*, *Hybrid* (including Converged Learning), *Online*, and *Other*
  - **Open only**, which hides closed sections
  - **Instructor** picker, listing every instructor teaching that term
  - **Clear filters** resets them all in one click
- **Honors sections in one place.** NJIT lists honors offerings (e.g. *"CONCEPTS IN BIOLOGY - HONORS"*) as a separate course. Scheduler+ merges them into the base course and marks those sections with a purple **Honors** badge.

### 📋 Everything about a section, at a glance
Expand any course to see each section with:
- Section number, **CRN**, and **Honors** badge where it applies
- **Status**, color-coded: 🟢 Open · 🟠 Full (seats taken but not yet closed) · 🔴 Closed
- **Enrollment** (current / max seats)
- Every meeting's **days, times, and room**, including sections that meet in different rooms on different days
- **Instructor**, linked to their NJIT faculty profile when one exists
- **Delivery mode** and **credits**

Each course works like a radio group: pick one section per course. Picking another section swaps it in, and clicking the selected section again removes it.

### 🗓️ Visual weekly schedule
- A **Monday–Friday calendar grid** draws each class as a color-coded block at its real time.
- The grid **expands automatically** past the default 8 AM – 9 PM range if you add an early-morning or late-evening class.
- Blocks **show more detail when there's room**: course code, section, room, and time always appear; the course title and instructor appear on longer classes.
- **Closed** and **Full** sections get a corner badge, so you can see at a glance which picks still need a seat.
- **Hover** any block for its full details.
- Classes that can't go on a weekday grid (**weekend, asynchronous online, or TBA** meetings) are listed in a separate panel so they don't get lost.

### ⚠️ Conflict detection
Overlapping classes are flagged in several places:
- An **amber ring** around the overlapping blocks on the grid
- A **⚠ conflict** tag on the section in the course list
- A **conflict count** in the header
- A summary listing **exactly which sections overlap** (e.g. *"MATH 211 §003 overlaps PHYS 121 §005"*)

### 🧮 Running totals
The header always shows how many sections you've picked and your **total credits**, so you can check you're within full-time or overload limits.

### 📤 Export & print
- **Download `.ics`.** One click creates a calendar file you can import into **Google Calendar, Apple Calendar, or Outlook**. Each class becomes a weekly recurring event for the semester, with the course title, section, CRN, instructor, delivery mode, credits, and room.
- **Print schedule.** Prints just the calendar and your section list, without the search pane or header.

### 💾 No account, nothing to lose
- **No login, no sign-up, no tracking.** Your schedule is saved in your browser's local storage and never leaves your device.
- Selections are **saved separately for each term**, so you can plan Summer and Fall side by side and switch between them with the term dropdown.
- The app **remembers the last term you viewed**.

### 🔄 Up-to-date data
- Course data comes from NJIT's public course schedule and is **refreshed automatically every 3 hours** by a scheduled GitHub Action.
- The **two most recent terms** are always available (currently *2026 Fall* and *2026 Summer*).

### 🌗 Designed for students
- **Light and dark mode** follow your system setting.
- **Responsive layout:** side-by-side panes on desktop, stacked on smaller screens.
- NJIT Highlander Red appears as an accent rather than a full theme.

---

## How to use it

1. **Pick a term** from the dropdown in the header.
2. **Find a course.** Type a code like `CS 114` in the search box or pick a subject from the dropdown, and narrow the list with the filter chips if you like.
3. **Expand the course** and **select a section**. It appears on your weekly calendar right away.
4. Repeat until your week looks right. **Watch for amber conflict warnings** and the running credit count.
5. **Export:** use **Export → Download .ics** to add the schedule to your calendar, or **Export → Print schedule**.
6. Register in **Highlander Pipeline** using the CRNs listed under *Your sections*.

> [!IMPORTANT]
> Scheduler+ is a planning tool. It does **not** register you for classes. Seat counts can change between data refreshes, so always confirm section status in Highlander Pipeline before you register.

---

## How it works

```
┌────────────────────────┐   every 3h   ┌──────────────────────┐   commit   ┌──────────────┐
│ NJIT Banner course     │ ───────────▶ │  scripts/scrape.ts   │ ─────────▶ │ public/data/ │
│ schedule (JSON + HTML) │  GitHub      │  fetch → parse →     │            │  *.json      │
└────────────────────────┘  Actions     │  merge honors        │            └──────┬───────┘
                                        └──────────────────────┘                   │ deploy
                                                                                   ▼
                                       ┌──────────────────────────────────────────────────┐
                                       │ Next.js app (static)                             │
                                       │  • fetches /data/terms.json + /data/<term>.json  │
                                       │  • search, filters, grid and conflicts run in    │
                                       │    the browser                                   │
                                       │  • selections saved to localStorage              │
                                       └──────────────────────────────────────────────────┘
```

- **No live backend.** A build-time scraper ([`scripts/scrape.ts`](scripts/scrape.ts)) calls the same endpoints NJIT's public schedule page uses, parses the section tables with [cheerio](https://cheerio.js.org/), and writes one JSON file per term to [`public/data/`](public/data/).
- **Automated refresh.** [`.github/workflows/scrape.yml`](.github/workflows/scrape.yml) runs the scraper every 3 hours (and on demand from the Actions tab). It commits only when the data changed, which triggers a new deploy.
- **Client-side app.** The browser downloads the term's catalog once, and searching, filtering, grid layout, and conflict detection then run locally without further network requests.

---

## Getting started (development)

### Prerequisites
- **Node.js 22+** (the CI workflow uses Node 22)
- npm

### Install & run

```bash
git clone https://github.com/bev8090/NJIT-Course-Scheduler-.git
cd NJIT-Course-Scheduler-
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

The repository already includes scraped data in `public/data/`, so the app works right away without running the scraper.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Create a production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run scrape` | Pull fresh course data from NJIT into `public/data/` |

### Scraper options

`npm run scrape` reads these optional environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `TERMS` | `2` | How many of the newest terms to scrape |
| `CONCURRENCY` | `6` | Number of subjects fetched in parallel per term |

```bash
TERMS=3 CONCURRENCY=4 npm run scrape
```

---

## Project structure

```
├── .github/workflows/scrape.yml   # Scheduled data refresh (every 3 hours)
├── public/data/
│   ├── terms.json                 # Terms shown in the term dropdown
│   └── <termCode>.json            # Full catalog per term (e.g. 202690 = 2026 Fall)
├── scripts/
│   └── scrape.ts                  # Build-time scraper entry point
└── src/
    ├── app/
    │   ├── layout.tsx             # Root layout + page metadata
    │   ├── page.tsx               # Renders <Scheduler />
    │   ├── globals.css            # Tailwind, NJIT brand colors, print styles
    │   ├── icon.svg               # App icon (modern browsers)
    │   ├── favicon.ico            # 16/32/48px fallback icon
    │   └── apple-icon.png         # iOS home-screen icon
    ├── components/
    │   ├── Scheduler.tsx          # Top-level state: term, selection, filters
    │   ├── CourseBrowser.tsx      # Search, filters, course and section list
    │   ├── SchedulePane.tsx       # Weekly grid, off-grid list, selected sections
    │   └── ExportMenu.tsx         # Print + .ics download
    └── lib/
        ├── njit.ts                # Client for NJIT's Banner endpoints
        ├── parse-sections.ts      # HTML → typed Course[] (with honors merge)
        ├── schedule.ts            # Conflict detection, grid layout, formatting
        ├── ical.ts                # RFC 5545 .ics generation
        ├── storage.ts             # localStorage persistence
        └── types.ts               # Shared data types
```

### Term codes

NJIT term codes are `YYYY` followed by a season code:

| Suffix | Season |
| --- | --- |
| `10` | Spring |
| `50` | Summer |
| `90` | Fall |
| `95` | Winter |

---

## Tech stack

- **[Next.js 16](https://nextjs.org/)** (App Router) + **[React 19](https://react.dev/)**
- **[TypeScript](https://www.typescriptlang.org/)**
- **[Tailwind CSS 4](https://tailwindcss.com/)**
- **[cheerio](https://cheerio.js.org/)** for parsing NJIT's section tables, and **[p-limit](https://github.com/sindresorhus/p-limit)** to limit concurrent requests
- **GitHub Actions** for scheduled data refreshes, **Vercel** for hosting

---

## Known limitations

- **Calendar export dates are approximate.** NJIT's API doesn't publish semester start and end dates, so `.ics` events use typical windows for each season. Check the first and last class dates against the official academic calendar.
- **Seat counts can be up to ~3 hours old**, depending on when the last refresh ran.
- **Weekend, asynchronous, and TBA meetings** are listed below the grid rather than drawn on it.
- **Schedules are stored per browser.** Clearing site data, or switching devices or browsers, starts you with an empty schedule.

---

## Disclaimer

NJIT Course Scheduler+ is an independent student project. It is **not affiliated with, endorsed by, or supported by the New Jersey Institute of Technology**. Course data comes from NJIT's publicly available course schedule and may be incomplete or out of date. Always confirm details in official NJIT systems before registering.
