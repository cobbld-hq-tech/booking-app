import { neon, NeonDbError, type NeonQueryFunction } from "@neondatabase/serverless";
import { env } from "./env";
import { generateCandidateSlots, intervalsOverlap, type CandidateSlot } from "./availability";
import { formatTime, todayLocalDateString, parseDateString, zonedWallTimeToUtc } from "./time";
import { BOOKING_HORIZON_DAYS } from "./business-hours";

// Lazily create the Neon HTTP client. The serverless driver issues a fresh HTTP
// request per query, so this is ideal for short-lived serverless invocations —
// no connection pool to manage. Created on first use so importing this module
// never requires DATABASE_URL to be set (keeps `next build` happy).
//
// <false, false> = arrayMode off (rows as objects), fullResults off (queries
// resolve to a plain row array), so query results are Record<string, any>[].
let _sql: NeonQueryFunction<false, false> | null = null;

function sql(): NeonQueryFunction<false, false> {
  if (!_sql) _sql = neon(env.databaseUrl);
  return _sql;
}

/** Postgres SQLSTATE for an exclusion-constraint violation — our overlap bounce. */
const EXCLUSION_VIOLATION = "23P01";

function isExclusionViolation(error: unknown): boolean {
  // The Neon HTTP driver surfaces the Postgres SQLSTATE on `.code`, mirroring
  // node-postgres. Check the class explicitly, then fall back to a duck-typed
  // read in case of wrapping.
  if (error instanceof NeonDbError && error.code === EXCLUSION_VIOLATION) return true;
  return Boolean(
    error && typeof error === "object" && (error as { code?: string }).code === EXCLUSION_VIOLATION,
  );
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface Service {
  id: number;
  name: string;
  durationMinutes: number;
}

export interface AvailableSlot {
  /** ISO-8601 UTC instant of the start; this is the value posted back to book. */
  startIso: string;
  /** Shop-local display label, e.g. "9:00 AM". */
  label: string;
}

export interface BookingConfirmation {
  id: string;
  serviceName: string;
  durationMinutes: number;
  customerName: string;
  startIso: string;
  endIso: string;
}

export interface AdminBooking {
  id: string;
  serviceName: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  startIso: string;
  endIso: string;
  status: string;
}

export interface TimeOffBlock {
  id: string;
  startsAtIso: string;
  endsAtIso: string;
  reason: string | null;
}

export interface CreateBookingInput {
  serviceId: number;
  /** Shop-local "YYYY-MM-DD" the slot belongs to (used to re-derive/validate the grid). */
  dateStr: string;
  /** ISO-8601 UTC start instant the customer chose. */
  startIso: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
}

export type CreateBookingResult =
  | { ok: true; booking: BookingConfirmation }
  | { ok: false; reason: "conflict" } // slot was claimed in the meantime (23P01)
  | { ok: false; reason: "invalid"; message: string };

// ── Services ─────────────────────────────────────────────────────────────────

export async function getActiveServices(): Promise<Service[]> {
  const rows = await sql()`
    SELECT id, name, duration_minutes
    FROM services
    WHERE active
    ORDER BY sort_order, id
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    durationMinutes: Number(r.duration_minutes),
  }));
}

async function getServiceById(id: number): Promise<Service | null> {
  const rows = await sql()`
    SELECT id, name, duration_minutes
    FROM services
    WHERE id = ${id} AND active
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  return {
    id: Number(rows[0].id),
    name: String(rows[0].name),
    durationMinutes: Number(rows[0].duration_minutes),
  };
}

// ── Availability (read-side) ─────────────────────────────────────────────────

/**
 * Open start times for `serviceId` on `dateStr`, generated from business hours
 * minus existing confirmed bookings minus time-off, dropping any slot already in
 * the past. Best-effort display only — see lib/availability.ts. Returns an empty
 * array (not an error) for a closed day or an unknown service.
 */
export async function getAvailableSlots(
  serviceId: number,
  dateStr: string,
): Promise<{ service: Service | null; slots: AvailableSlot[] }> {
  const service = await getServiceById(serviceId);
  if (!service) return { service: null, slots: [] };

  let candidates: CandidateSlot[];
  try {
    candidates = generateCandidateSlots(dateStr, service.durationMinutes);
  } catch {
    // Malformed date string — treat as no availability rather than throwing.
    return { service, slots: [] };
  }
  if (candidates.length === 0) return { service, slots: [] };

  // Window the day so we only pull bookings/time-off that could intersect it.
  const dayStart = candidates[0].startUtc;
  const dayEnd = candidates[candidates.length - 1].endUtc;
  const [bookings, blocks] = await Promise.all([
    sql()`
      SELECT start_time, end_time
      FROM bookings
      WHERE resource_id = 1 AND status = 'confirmed'
        AND start_time < ${dayEnd.toISOString()}
        AND end_time   > ${dayStart.toISOString()}
    `,
    sql()`
      SELECT starts_at, ends_at
      FROM time_off
      WHERE resource_id = 1
        AND starts_at < ${dayEnd.toISOString()}
        AND ends_at   > ${dayStart.toISOString()}
    `,
  ]);

  const taken: Array<[Date, Date]> = [
    ...bookings.map((b) => [new Date(b.start_time), new Date(b.end_time)] as [Date, Date]),
    ...blocks.map((t) => [new Date(t.starts_at), new Date(t.ends_at)] as [Date, Date]),
  ];

  const now = Date.now();
  const open = candidates.filter((slot: CandidateSlot) => {
    if (slot.startUtc.getTime() <= now) return false; // no booking in the past
    return !taken.some(([s, e]) => intervalsOverlap(slot.startUtc, slot.endUtc, s, e));
  });

  return {
    service,
    slots: open.map((slot) => ({
      startIso: slot.startUtc.toISOString(),
      label: formatTime(slot.startUtc),
    })),
  };
}

// ── Create a booking (the claim) ─────────────────────────────────────────────

/**
 * Attempt to book a slot. THE INSERT IS THE CLAIM: we validate the request shape
 * (known active service, start on the legitimate hours grid, not in the past,
 * within the booking horizon) but we do NOT check availability first — that would
 * be a race. We just INSERT; if a confirmed booking already overlaps, Postgres
 * raises the exclusion violation (23P01) and we return `{ reason: "conflict" }`.
 * The conflict is expected business flow and is never reported to Sentry.
 */
export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  const name = input.customerName.trim();
  const phone = input.customerPhone.trim();
  const email = input.customerEmail?.trim() || null;

  if (name.length === 0) return { ok: false, reason: "invalid", message: "Name is required." };
  if (phone.length < 7) return { ok: false, reason: "invalid", message: "A valid phone number is required." };

  const service = await getServiceById(input.serviceId);
  if (!service) return { ok: false, reason: "invalid", message: "That service is no longer available." };

  // The chosen start must be one of the legitimate grid slots for this service +
  // date (within hours, on the step grid). This validates the *request*, not
  // availability — even a valid slot may still bounce on the constraint below.
  // A malformed date is rejected here as invalid input, never thrown (so it never
  // reaches Sentry as a false "unexpected" error).
  let candidates: CandidateSlot[];
  try {
    candidates = generateCandidateSlots(input.dateStr, service.durationMinutes);
  } catch {
    return { ok: false, reason: "invalid", message: "That date is not valid." };
  }
  const match = candidates.find((c) => c.startUtc.toISOString() === input.startIso);
  if (!match) {
    return { ok: false, reason: "invalid", message: "That start time is outside business hours." };
  }
  if (match.startUtc.getTime() <= Date.now()) {
    return { ok: false, reason: "invalid", message: "That time is in the past. Pick another." };
  }
  // Booking-horizon backstop (e.g. no booking years out). Compared as a whole
  // shop-local day — the cutoff is local midnight after the last bookable day, so
  // the entire final day stays bookable (not just its morning).
  const today = parseDateString(todayLocalDateString());
  const horizonExclusive = zonedWallTimeToUtc(
    today.year,
    today.month,
    today.day + BOOKING_HORIZON_DAYS + 1,
    0,
    0,
  );
  if (match.startUtc.getTime() >= horizonExclusive.getTime()) {
    return { ok: false, reason: "invalid", message: "That date is too far out to book online." };
  }

  // Best-effort guard against owner time-off. Owner-added blocks are not a hot
  // customer race, so a pre-insert read is acceptable here; the atomic
  // booking-vs-booking guard remains the exclusion constraint in the INSERT below.
  const blocks = await sql()`
    SELECT 1 FROM time_off
    WHERE resource_id = 1
      AND starts_at < ${match.endUtc.toISOString()}
      AND ends_at   > ${match.startUtc.toISOString()}
    LIMIT 1
  `;
  if (blocks.length > 0) return { ok: false, reason: "conflict" };

  try {
    const rows = await sql()`
      INSERT INTO bookings
        (service_id, customer_name, customer_phone, customer_email, start_time, end_time)
      VALUES
        (${service.id}, ${name}, ${phone}, ${email},
         ${match.startUtc.toISOString()}, ${match.endUtc.toISOString()})
      RETURNING id, start_time, end_time
    `;
    const row = rows[0];
    return {
      ok: true,
      booking: {
        id: String(row.id),
        serviceName: service.name,
        durationMinutes: service.durationMinutes,
        customerName: name,
        startIso: new Date(row.start_time).toISOString(),
        endIso: new Date(row.end_time).toISOString(),
      },
    };
  } catch (error) {
    if (isExclusionViolation(error)) {
      // Expected: someone else claimed this slot first. Not an error — let the
      // caller refresh the times. Deliberately NOT reported to Sentry.
      return { ok: false, reason: "conflict" };
    }
    throw error; // genuinely unexpected — bubble up to the route's reportError.
  }
}

// ── Admin reads + mutations ──────────────────────────────────────────────────

/** Upcoming bookings (both confirmed and cancelled), soonest first. */
export async function getUpcomingBookings(): Promise<AdminBooking[]> {
  const rows = await sql()`
    SELECT b.id, s.name AS service_name, b.customer_name, b.customer_phone,
           b.customer_email, b.start_time, b.end_time, b.status
    FROM bookings b
    JOIN services s ON s.id = b.service_id
    WHERE b.end_time > now()
    ORDER BY b.start_time ASC
  `;
  return rows.map((r) => ({
    id: String(r.id),
    serviceName: String(r.service_name),
    customerName: String(r.customer_name),
    customerPhone: String(r.customer_phone),
    customerEmail: r.customer_email ? String(r.customer_email) : null,
    startIso: new Date(r.start_time).toISOString(),
    endIso: new Date(r.end_time).toISOString(),
    status: String(r.status),
  }));
}

/** Cancel a booking. Sets status = 'cancelled', which drops it out of the
 *  exclusion constraint and instantly reopens its slot. Returns false if the id
 *  was unknown or already cancelled. */
export async function cancelBooking(id: string): Promise<boolean> {
  const rows = await sql()`
    UPDATE bookings
    SET status = 'cancelled'
    WHERE id = ${id} AND status = 'confirmed'
    RETURNING id
  `;
  return rows.length > 0;
}

/** Upcoming time-off blocks, soonest first. */
export async function getUpcomingTimeOff(): Promise<TimeOffBlock[]> {
  const rows = await sql()`
    SELECT id, starts_at, ends_at, reason
    FROM time_off
    WHERE ends_at > now()
    ORDER BY starts_at ASC
  `;
  return rows.map((r) => ({
    id: String(r.id),
    startsAtIso: new Date(r.starts_at).toISOString(),
    endsAtIso: new Date(r.ends_at).toISOString(),
    reason: r.reason ? String(r.reason) : null,
  }));
}

export interface AddTimeOffInput {
  startsAtIso: string;
  endsAtIso: string;
  reason?: string | null;
}

/** Add an admin time-off block. Validates ordering; the CHECK constraint is the
 *  backstop. Does not need the exclusion guard — time-off is owner-managed. */
export async function addTimeOff(input: AddTimeOffInput): Promise<{ ok: boolean; message?: string }> {
  const start = new Date(input.startsAtIso);
  const end = new Date(input.endsAtIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, message: "Invalid start or end time." };
  }
  if (end.getTime() <= start.getTime()) {
    return { ok: false, message: "End must be after start." };
  }
  await sql()`
    INSERT INTO time_off (starts_at, ends_at, reason)
    VALUES (${start.toISOString()}, ${end.toISOString()}, ${input.reason?.trim() || null})
  `;
  return { ok: true };
}

// ── Event spine + booking lifecycle (Phase 5) ────────────────────────────────

/** Append a domain event to the Neon log (the payback/audit consumer of the
 *  spine). Called by lib/events.ts alongside the Inngest send. */
export async function logEvent(type: string, bookingId: string | null, data: unknown): Promise<void> {
  await sql()`
    INSERT INTO events (type, booking_id, data)
    VALUES (${type}, ${bookingId}, ${JSON.stringify(data)}::jsonb)
  `;
}

export interface BookingDetail {
  id: string;
  serviceName: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  startIso: string;
  endIso: string;
  status: string;
}

/** Full booking by id (any status). The reminder function re-reads this after its
 *  durable wait to decide whether to still send. */
export async function getBookingById(id: string): Promise<BookingDetail | null> {
  const rows = await sql()`
    SELECT b.id, s.name AS service_name, b.customer_name, b.customer_phone,
           b.customer_email, b.start_time, b.end_time, b.status
    FROM bookings b JOIN services s ON s.id = b.service_id
    WHERE b.id = ${id}
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: String(r.id),
    serviceName: String(r.service_name),
    customerName: String(r.customer_name),
    customerPhone: String(r.customer_phone),
    customerEmail: r.customer_email ? String(r.customer_email) : null,
    startIso: new Date(r.start_time).toISOString(),
    endIso: new Date(r.end_time).toISOString(),
    status: String(r.status),
  };
}

/** Mark a confirmed booking done (admin). Returns false if it was not confirmed. */
export async function markBookingCompleted(id: string): Promise<boolean> {
  const rows = await sql()`
    UPDATE bookings SET status = 'completed'
    WHERE id = ${id} AND status = 'confirmed'
    RETURNING id
  `;
  return rows.length > 0;
}

/** Mark a confirmed booking a no-show (admin). Returns false if it was not confirmed. */
export async function markBookingNoShow(id: string): Promise<boolean> {
  const rows = await sql()`
    UPDATE bookings SET status = 'no_show'
    WHERE id = ${id} AND status = 'confirmed'
    RETURNING id
  `;
  return rows.length > 0;
}
