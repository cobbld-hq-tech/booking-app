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
