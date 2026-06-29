// Timezone-correct conversions between the shop's local wall-clock time and UTC.
//
// The rule for this app (and the brief): STORE UTC, RENDER LOCAL. The database
// holds `timestamptz` (UTC instants); customers always see the shop's Central
// time. Everything DST-aware below is driven by the IANA database via `Intl`, so
// there is no hand-maintained offset table and no extra dependency.

import { TIMEZONE } from "./business-hours";

/**
 * How far ahead of UTC the given timezone is at a given instant, in milliseconds.
 *
 * Technique: format the instant into the zone's wall-clock parts, reinterpret
 * those parts as if they were UTC, and subtract the real instant. The difference
 * is the zone's offset at that moment (positive = ahead of UTC). This is the
 * standard `Intl`-only way to read a zone offset without a date library.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  // Some engines render midnight as hour "24"; normalise to 0.
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - instant.getTime();
}

/**
 * Convert a wall-clock time in `timeZone` to the corresponding UTC instant.
 *
 * Two passes handle DST transitions: the first guess treats the wall time as if
 * it were UTC and corrects by that instant's offset; if the corrected instant
 * falls on the other side of a DST change (its offset differs), a second pass
 * re-applies the right offset. Ambiguous/skipped wall times (the 1h that repeats
 * or vanishes at a transition) resolve deterministically — fine for booking slots
 * that never sit on a 2 a.m. boundary.
 */
export function zonedWallTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  timeZone: string = TIMEZONE,
): Date {
  const guessMs = Date.UTC(year, month - 1, day, hour, minute);
  const offset1 = zoneOffsetMs(new Date(guessMs), timeZone);
  let utcMs = guessMs - offset1;
  const offset2 = zoneOffsetMs(new Date(utcMs), timeZone);
  if (offset2 !== offset1) {
    utcMs = guessMs - offset2;
  }
  return new Date(utcMs);
}

/** The shop-local calendar date of an instant, as "YYYY-MM-DD" (en-CA gives ISO order). */
export function localDateString(instant: Date, timeZone: string = TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Today's date in the shop's timezone, as "YYYY-MM-DD". Used as the min bookable day. */
export function todayLocalDateString(timeZone: string = TIMEZONE): string {
  return localDateString(new Date(), timeZone);
}

/** Parse a strict "YYYY-MM-DD" string into numeric parts. Throws on malformed input. */
export function parseDateString(dateStr: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) throw new Error(`Invalid date string (expected YYYY-MM-DD): ${JSON.stringify(dateStr)}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`Date out of range: ${dateStr}`);
  }
  return { year, month, day };
}

/** JS weekday (0 = Sun … 6 = Sat) for a shop-local calendar date. Computed at
 *  local noon so DST edges near midnight can never shift the day. */
export function weekdayOfLocalDate(dateStr: string, timeZone: string = TIMEZONE): number {
  const { year, month, day } = parseDateString(dateStr);
  const noon = zonedWallTimeToUtc(year, month, day, 12, 0, timeZone);
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(noon);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

// ── Display formatters (always render in the shop's timezone) ────────────────

/** "9:00 AM" */
export function formatTime(instant: Date, timeZone: string = TIMEZONE): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(instant);
}

/** "Mon, Jun 30" */
export function formatDayLabel(instant: Date, timeZone: string = TIMEZONE): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(instant);
}

/** "Monday, June 30, 2026" */
export function formatLongDate(instant: Date, timeZone: string = TIMEZONE): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(instant);
}

/** Parse a "YYYY-MM-DD" string at local noon, for labelling a chosen date. */
export function localDateAtNoon(dateStr: string, timeZone: string = TIMEZONE): Date {
  const { year, month, day } = parseDateString(dateStr);
  return zonedWallTimeToUtc(year, month, day, 12, 0, timeZone);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export interface DayOption {
  /** "YYYY-MM-DD" shop-local calendar date. */
  dateStr: string;
  /** "Mon" */
  weekdayShort: string;
  /** "Jun" */
  monthShort: string;
  dayNum: number;
  /** Is the shop open at all on this weekday? */
  isOpen: boolean;
  /** Is this today (shop-local)? */
  isToday: boolean;
}

/**
 * The next `count` shop-local calendar days starting today. Computed on the
 * server so the day list is anchored to the SHOP's timezone, not the visitor's
 * browser. We walk calendar dates with a UTC-noon cursor (a pure Y/M/D counter,
 * immune to DST), and only the "what is today in Central" anchor is zone-aware.
 */
export function listUpcomingDays(
  count: number,
  isOpenWeekday: (weekday: number) => boolean,
  timeZone: string = TIMEZONE,
): DayOption[] {
  const today = todayLocalDateString(timeZone);
  const { year, month, day } = parseDateString(today);
  // A UTC date used purely as a calendar cursor (noon avoids any midnight edge).
  const cursor = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  const out: DayOption[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(cursor.getTime());
    d.setUTCDate(cursor.getUTCDate() + i);
    const y = d.getUTCFullYear();
    const mo = d.getUTCMonth() + 1;
    const dn = d.getUTCDate();
    const weekday = d.getUTCDay(); // weekday of this calendar date
    out.push({
      dateStr: `${y}-${pad2(mo)}-${pad2(dn)}`,
      weekdayShort: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(d),
      monthShort: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" }).format(d),
      dayNum: dn,
      isOpen: isOpenWeekday(weekday),
      isToday: i === 0,
    });
  }
  return out;
}
