# UQ Timetable Planner

Pulls your UQ class times from UQ's public timetable, then lets you put the rest
of your life — work shifts, gym, social plans — on the same grid and share the
whole thing with a link.

The official UQ timetable only knows about classes, and it has no way to show
anyone else what your week actually looks like. This fixes both.

## Running it

You need a Postgres connection string. The easiest free option is a
[Neon](https://neon.tech) or [Supabase](https://supabase.com) database; a local
Postgres works too.

```bash
npm install
cp .env.example .env     # then paste your DATABASE_URL into it
npm run dev
```

- Web app: http://localhost:5173
- API: http://localhost:3001

`npm run dev` starts both. Tables are created automatically on first request, so
a brand-new empty database needs no migration step.

## Deploying to Vercel

1. **Create a Postgres database.** On Supabase, copy the **Transaction pooler**
   string (port `6543`) from *Connect* — not the direct connection, which is
   IPv6-only and unreachable from Vercel without a paid add-on. Replace
   `[YOUR-PASSWORD]` with your database password.
2. **Import the repo** at [vercel.com/new](https://vercel.com/new). The build
   settings come from [vercel.json](vercel.json) — no manual configuration.
3. **Add the environment variable** `DATABASE_URL` in
   *Settings → Environment Variables*, for Production, Preview and Development.
4. **Deploy.** The schema is created on the first request.

How it fits together on Vercel:

- The Vite build is served as static files from `dist`.
- [api/index.js](api/index.js) mounts the Express app as one function. The
  `/api/(.*)` rewrite sends API requests to it with the original URL intact, so
  the app's own `/api/...` routes still match. Do **not** rename this to a
  `[...path].js` catch-all — that is a Next.js convention and Vercel's plain
  /api directory ignores it, making every route 404.
- `vercel.json` rewrites `/s/*` to the SPA shell, so share links survive a
  refresh or being opened cold. It is scoped to `/s/` so it can't shadow the API.
  (That file is schema-validated by Vercel — it rejects unknown keys, so no
  stray "comment" fields.)
- Because the API is same-origin, the session cookie works with no CORS setup,
  and `secure` switches on automatically in production.

**Do not use a file-based database here.** Vercel functions are ephemeral and
scale horizontally: a SQLite file would be wiped on every cold start and would
differ between concurrent instances. That is why this uses Postgres.

Keep `PG_POOL_MAX` small (it defaults to 3). Each instance holds its own pool,
and serverless platforms can run many instances at once.

## What it does

- **Search UQ courses** by code or name (`CSSE2310`, `calculus`) against the live
  public timetable.
- **Pick your actual classes.** Each course exposes activity groups (LEC01,
  TUT01, PRA01) and you choose one option from each. Picking a different option
  in a group replaces the previous one.
- **Add everything else** as weekly or one-off events across seven categories.
  Entered as start-and-end times, not a duration. A weekly event can name
  several days at once — a shift at the same place is typed once and lands on
  Mon/Wed/Fri as three independently editable events. **Duplicate** copies an
  existing event's title, category and location onto a new day.
- **Clash detection.** Anything overlapping is outlined in red. Lecture
  recordings are excluded, since "delayed viewing" doesn't really conflict.
- **Week navigation** using UQ's real per-session dates, so teaching breaks and
  non-running weeks are accurate rather than assumed.
- **Share links** at `/s/:token`, read-only and public, with a toggle to revoke.
  Your email is never exposed — only your display name.
- **Export to `.ics`** for Google Calendar, Apple Calendar or Outlook.
- **Save the week as a PNG or JPG**, drawn onto a canvas rather than
  screenshotted from the DOM, so the output is a fixed 1700px-wide image at 2×
  that looks identical on every machine. See [src/lib/exportImage.ts](src/lib/exportImage.ts).

## Layout

```
server/
  index.js   Local dev listener only
  app.js     The Express app (exported, so Vercel and local dev share it)
  db.js      Postgres pool, schema and query helpers
  uq.js      UQ public timetable client + normalisation
  auth.js    Password hashing, sessions, route guards
src/
  App.tsx            Top-level state and routing
  api.ts             Typed client for the local API
  lib/schedule.ts    Week maths, occurrence expansion, clash detection, ICS
  lib/colors.ts      Course and category palettes
  components/        Auth, course search, calendar grid, event editor, sharing
```

## The UQ API

Class data comes from UQ's public timetable:

```
POST https://timetable.my.uq.edu.au/aplus/rest/timetable/subjects
Content-Type: application/x-www-form-urlencoded
search-term, campus, semester, type, faculty, days, start-time, end-time
```

Things worth knowing, all verified against the live service:

- **POST only.** `GET` returns 405.
- **No authentication**, but also **no CORS headers**, which is why the request
  has to go through `server/uq.js` instead of straight from the browser.
- **Results are capped at 100** per query, so vague searches get truncated.
- Each activity carries `activitiesDays`, an explicit list of dates it runs.
  That's what drives the calendar — no need to decode the `week_pattern` bitmap.
- The older `/odd/` and `/even/` endpoints that older UQ tools used are **dead**;
  they now 301 to `/aplus`.

Picked classes are stored as a snapshot, so a saved timetable keeps rendering
even if UQ later changes or withdraws an offering.

## Notes and limitations

- Class times are what UQ publishes for a course, not your personal Allocate+
  allocation — you choose which class you're in. That also makes it usable as a
  "what if" planner before allocation opens.
- Times assume Brisbane (UTC+10, no daylight saving). The `.ics` export converts
  to UTC on that basis.
- Sessions are cookie-based and last 30 days. The `secure` flag turns on with
  `NODE_ENV=production`, which Vercel sets for you.
- Expired sessions are filtered in SQL, but nothing prunes the rows. If this ever
  gets real traffic, add a periodic `DELETE FROM sessions WHERE expires_at < now()`.
- Unofficial and not affiliated with the University of Queensland.
