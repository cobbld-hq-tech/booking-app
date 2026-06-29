import { Inngest } from "inngest";

// The Inngest client. `isDev` is pinned to the environment because Turbopack does
// not surface NODE_ENV in the way the SDK's auto-detection expects: in dev it
// talks to the local Inngest Dev Server (no keys needed); in production
// (NODE_ENV=production on Vercel) it runs in cloud mode and uses
// INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY. This is the durable-function consumer
// of the domain-event spine.
export const inngest = new Inngest({
  id: "permian-auto-booking",
  isDev: process.env.NODE_ENV !== "production",
});

/** The domain events emitted on transactional writes (see lib/events.ts). */
export type BookingEventName =
  | "booking.created"
  | "booking.cancelled"
  | "booking.completed"
  | "booking.no_show";
