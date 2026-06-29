// Read-side slot generation. This produces the start times we OFFER a customer
// for a given service + date, from business hours alone. It is best-effort
// display only: a slot can vanish between page load and submit, and that is
// fine — the database exclusion constraint is the real protection, and the
// booking route handles a bounce cleanly. Nothing here prevents double-booking.

import { BUSINESS_HOURS, SLOT_STEP_MINUTES, TIMEZONE } from "./business-hours";
import { parseDateString, weekdayOfLocalDate, zonedWallTimeToUtc } from "./time";

export interface CandidateSlot {
  startUtc: Date;
  endUtc: Date;
}

/** "07:30" -> 450 (minutes past local midnight). */
function parseHHMM(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Every candidate start time for `dateStr` (a shop-local "YYYY-MM-DD") given a
 * service of `durationMinutes`, walking the business-hours window on the
 * SLOT_STEP_MINUTES grid. A slot is only offered if the FULL service fits before
 * close (`start + duration <= close`), so a 2h job near closing simply isn't
 * shown. Returns UTC instants; the caller renders them in shop-local time.
 */
export function generateCandidateSlots(
  dateStr: string,
  durationMinutes: number,
): CandidateSlot[] {
  const weekday = weekdayOfLocalDate(dateStr, TIMEZONE);
  const hours = BUSINESS_HOURS[weekday];
  if (!hours) return []; // closed that day

  const { year, month, day } = parseDateString(dateStr);
  const openMin = parseHHMM(hours.open);
  const closeMin = parseHHMM(hours.close);

  const slots: CandidateSlot[] = [];
  for (let start = openMin; start + durationMinutes <= closeMin; start += SLOT_STEP_MINUTES) {
    const startUtc = zonedWallTimeToUtc(
      year,
      month,
      day,
      Math.floor(start / 60),
      start % 60,
      TIMEZONE,
    );
    const endUtc = new Date(startUtc.getTime() + durationMinutes * 60_000);
    slots.push({ startUtc, endUtc });
  }
  return slots;
}

/** Do half-open intervals [aStart, aEnd) and [bStart, bEnd) overlap? */
export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}
