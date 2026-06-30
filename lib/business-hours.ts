// Shop identity + business hours. For the POC these are config-in-code (not a
// table): one concrete shop, no multi-tenant abstraction. Change the values here
// to re-skin the demo for a different shop.

/** IANA timezone the shop operates in. Stored times are UTC; everything is
 *  displayed in this zone. Midland/Odessa TX is Central. */
export const TIMEZONE = "America/Chicago";

export const SHOP = {
  name: "Permian Auto Works",
  tagline: "Straight answers. Honest work. One bay, done right.",
  city: "Odessa, TX",
  addressLine: "2412 W County Rd, Odessa, TX 79764",
  phone: "(432) 555-0142",
  phoneHref: "tel:+14325550142",
  email: "shop@permianautoworks.example",
  /** Short label shown next to times so customers know the zone. */
  tzLabel: "Central",
} as const;

/** Open/close for a single weekday, as 24h "HH:MM" wall-clock strings (local). */
export interface DayHours {
  open: string;
  close: string;
}

/**
 * Weekly business hours, indexed by JS weekday (0 = Sunday … 6 = Saturday).
 * `null` means closed that day. A single tech in one bay, so hours are tighter
 * than a multi-bay shop: weekdays 7:30a–6:00p, Saturday half day, Sunday closed.
 */
export const BUSINESS_HOURS: (DayHours | null)[] = [
  null, // Sun — closed
  { open: "07:30", close: "18:00" }, // Mon
  { open: "07:30", close: "18:00" }, // Tue
  { open: "07:30", close: "18:00" }, // Wed
  { open: "07:30", close: "18:00" }, // Thu
  { open: "07:30", close: "18:00" }, // Fri
  { open: "08:00", close: "14:00" }, // Sat
];

/** Human-readable hours for display (kept in sync with BUSINESS_HOURS above). */
export const HOURS_DISPLAY = [
  { label: "Mon–Fri", value: "7:30a – 6:00p" },
  { label: "Saturday", value: "8:00a – 2:00p" },
  { label: "Sunday", value: "Closed" },
];

/** Granularity of the start-time grid shown to customers, in minutes. The DB
 *  exclusion constraint is what actually prevents overlaps, so this only affects
 *  which start times we *offer* — service durations can still differ. */
export const SLOT_STEP_MINUTES = 30;

/** How many days ahead (including today) a customer may book. */
export const BOOKING_HORIZON_DAYS = 30;

/** How many days ahead the date picker actually offers — a window that sits inside
 *  the BOOKING_HORIZON_DAYS hard cap. Shared by the booking rail, the reschedule
 *  rail, and the day-availability endpoint so the three never drift apart. */
export const BOOKING_WINDOW_DAYS = 14;

/** Daytime window (shop-local hour, 24h) the reminder nudge send is pulled into,
 *  so a timer never texts in the small hours (under any lead, across DST). The
 *  start is early (6am) on purpose: the shop opens at 7:30, so a 1h reminder for an
 *  early slot lands ~6:30am and must still go out. A send before the window moves to
 *  its start; one at/after moves to the next day's start; a send that would land
 *  at/after the appointment is dropped. */
export const REMINDER_DAYTIME_START_HOUR = 6;
export const REMINDER_DAYTIME_END_HOUR = 21;
