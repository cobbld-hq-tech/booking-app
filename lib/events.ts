import { inngest, type BookingEventName } from "./inngest/client";
import { logEvent } from "./db";

// The domain-event spine. Every transactional write calls this once. It does two
// things, in order: (1) durably logs the event to Neon (read later by payback
// measurement and as an audit trail), then (2) hands it to Inngest, which drives
// the durable functions (reminders now; review / no-show sequences later). One
// spine, two consumers.
export async function emitBookingEvent(
  name: BookingEventName,
  data: { bookingId: string; startIso?: string },
): Promise<void> {
  await logEvent(name, data.bookingId, data);
  // Deterministic id so Inngest dedupes a re-sent event: a duplicate
  // booking.created for the same booking can never schedule a second reminder.
  await inngest.send({ id: `${name}:${data.bookingId}`, name, data });
}
