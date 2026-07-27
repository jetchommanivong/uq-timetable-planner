import pg from 'pg'

const { Pool } = pg

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Create a Postgres database (Neon, Supabase or Vercel Postgres) ' +
      'and put its connection string in .env locally, or in the project environment variables on Vercel.',
  )
}

const isLocal = /@(localhost|127\.0\.0\.1)/.test(process.env.DATABASE_URL)

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Hosted Postgres requires TLS; a local server usually isn't set up for it.
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
  // Serverless functions scale horizontally, so each instance should hold only
  // a couple of connections or the database's connection cap gets exhausted.
  max: Number(process.env.PG_POOL_MAX ?? 3),
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
})

/** Runs a statement and returns all rows. */
export async function all(text, params = []) {
  const res = await pool.query(text, params)
  return res.rows
}

/** Runs a statement and returns the first row, or null. */
export async function one(text, params = []) {
  const res = await pool.query(text, params)
  return res.rows[0] ?? null
}

/** Runs a statement for its side effect only. */
export async function run(text, params = []) {
  await pool.query(text, params)
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS timetables (
  id          INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  share_token TEXT UNIQUE,
  is_shared   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A UQ class the user picked. Stored as a snapshot so the timetable keeps
-- working (and renders identically) even if UQ changes or drops the offering.
CREATE TABLE IF NOT EXISTS uq_classes (
  id                  INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  timetable_id        INTEGER NOT NULL REFERENCES timetables(id) ON DELETE CASCADE,
  subject_code        TEXT NOT NULL,
  callista_code       TEXT NOT NULL,
  description         TEXT NOT NULL,
  semester            TEXT,
  campus              TEXT,
  activity_group_code TEXT NOT NULL,
  activity_code       TEXT NOT NULL,
  activity_type       TEXT,
  day_of_week         TEXT,
  start_time          TEXT,
  duration_mins       INTEGER,
  location            TEXT,
  staff               TEXT,
  color               TEXT,
  dates               JSONB NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (timetable_id, subject_code, activity_group_code, activity_code)
);

-- Everything the UQ timetable can't hold: work shifts, gym, social, commute.
CREATE TABLE IF NOT EXISTS custom_events (
  id            INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  timetable_id  INTEGER NOT NULL REFERENCES timetables(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'other',
  recurrence    TEXT NOT NULL DEFAULT 'weekly',
  day_of_week   TEXT,
  event_date    TEXT,
  start_time    TEXT NOT NULL,
  duration_mins INTEGER NOT NULL,
  location      TEXT,
  notes         TEXT,
  color         TEXT
);

CREATE INDEX IF NOT EXISTS idx_tt_user   ON timetables(user_id);
CREATE INDEX IF NOT EXISTS idx_cls_tt    ON uq_classes(timetable_id);
CREATE INDEX IF NOT EXISTS idx_ev_tt     ON custom_events(timetable_id);
CREATE INDEX IF NOT EXISTS idx_sess_user ON sessions(user_id);
`

let schemaPromise = null

/**
 * Creates the schema if it isn't there yet.
 *
 * Memoised, because on Vercel every cold-started instance imports this module
 * and we only want one instance doing the work per process.
 */
export function ensureSchema() {
  schemaPromise ??= pool.query(SCHEMA).catch((err) => {
    // Let the next request retry rather than caching a failure forever.
    schemaPromise = null
    throw err
  })
  return schemaPromise
}

export function daysFromNow(days) {
  return new Date(Date.now() + days * 86_400_000)
}
