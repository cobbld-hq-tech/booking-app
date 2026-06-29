-- Permian Auto Works — booking schema (v1).
--
-- The double-booking guard lives HERE, in the database, not in app code. The app
-- never reads availability and then inserts (that is a race). The INSERT itself
-- is the claim: it either lands, or it bounces on the exclusion constraint. See
-- lib/db.ts (createBooking) for the SQLSTATE 23P01 catch.
--
-- Apply with:  psql "$DATABASE_URL" -f db/schema.sql
-- (or paste into the Neon SQL editor). Every statement is idempotent.

-- Range-overlap exclusion constraints on a scalar (resource_id) plus a range
-- need GiST indexing over both. btree_gist provides the GiST opclass for the
-- scalar `=` part. Supported on Neon.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── services ────────────────────────────────────────────────────────────────
-- What can be booked. duration_minutes drives both the slot grid (read-side) and
-- the end_time written into each booking, so mixed durations "just work".
CREATE TABLE IF NOT EXISTS services (
  id               int  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name             text NOT NULL,
  duration_minutes int  NOT NULL CHECK (duration_minutes > 0),
  active           boolean NOT NULL DEFAULT true,
  sort_order       int  NOT NULL DEFAULT 0
);

-- ── bookings ────────────────────────────────────────────────────────────────
-- One bay for the POC (resource_id defaults to 1). Multi-bay is a small future
-- extension: seed more resources and add a picker — resource_id is already in
-- the constraint.
CREATE TABLE IF NOT EXISTS bookings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id    int  NOT NULL DEFAULT 1,
  service_id     int  NOT NULL REFERENCES services(id),
  customer_name  text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text,
  start_time     timestamptz NOT NULL,
  end_time       timestamptz NOT NULL,
  status         text NOT NULL DEFAULT 'confirmed',
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bookings_end_after_start CHECK (end_time > start_time),
  CONSTRAINT bookings_status_valid CHECK (status IN ('confirmed', 'cancelled', 'completed', 'no_show')),

  -- No two CONFIRMED bookings on the same resource may overlap in time. The
  -- WHERE clause is what makes cancellation free: setting status = 'cancelled'
  -- drops a row out of the constraint, instantly reopening its slot.
  CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
    resource_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  ) WHERE (status = 'confirmed')
);

-- Fast lookups of confirmed bookings by resource + time window (availability read).
CREATE INDEX IF NOT EXISTS bookings_resource_time_idx
  ON bookings (resource_id, start_time)
  WHERE status = 'confirmed';

-- ── time_off ────────────────────────────────────────────────────────────────
-- Admin-added blocks: lunch, a closed afternoon, a whole day off. Subtracted
-- from availability read-side. (Customer-vs-customer races are guarded in the
-- DB; owner-added time-off is not a hot race, so it is a read-side subtraction.)
CREATE TABLE IF NOT EXISTS time_off (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id int  NOT NULL DEFAULT 1,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT time_off_end_after_start CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS time_off_resource_time_idx
  ON time_off (resource_id, starts_at);

-- ── events ──────────────────────────────────────────────────────────────────
-- The domain-event spine. Every transactional write emits an event here
-- (booking.created / cancelled / completed / no_show). Two consumers read it:
-- Inngest (durable functions — reminders etc.) and later payback measurement
-- (bookings created, completions, no-shows). One spine, logged as it is emitted.
CREATE TABLE IF NOT EXISTS events (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type       text NOT NULL,            -- e.g. 'booking.created'
  booking_id uuid,                     -- the subject booking, when applicable
  data       jsonb,                    -- the event payload sent to Inngest
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_type_created_idx ON events (type, created_at);
CREATE INDEX IF NOT EXISTS events_booking_idx ON events (booking_id);
