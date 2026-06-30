import { inngest } from "./client";
import { getBookingById } from "../db";
import { sendBookingReminder } from "../notify";
import { clampToDaytime } from "../time";
import { env } from "../env";
import { REMINDER_DAYTIME_START_HOUR, REMINDER_DAYTIME_END_HOUR } from "../business-hours";

// Phase 6: the same-day reminder nudge. The booking confirmation is a plain send
// on insert (see app/api/bookings/route.ts) — emailed when an address was given —
// so there is no separate day-ahead reminder. This durable function sends a single
// "see you soon" nudge REMINDER_LEAD_HOURS before the appointment.
//
// Canonical Inngest shape: the event fires, the function sleeps durably, it wakes
// and re-reads FRESH state, then it acts or stops. cancelOn kills the run on
// cancellation; the post-sleep status re-read is the backstop (and also catches a
// booking marked completed / no_show during the wait).
export const bookingReminder = inngest.createFunction(
  {
    id: "booking-reminder",
    triggers: [{ event: "booking.created" }],
    cancelOn: [{ event: "booking.cancelled", match: "data.bookingId" }],
  },
  async ({ event, step }) => {
    const bookingId = event.data.bookingId as string;

    const initial = await step.run("load-booking", () => getBookingById(bookingId));
    if (!initial || initial.status !== "confirmed") {
      return { skipped: "not confirmed when scheduled" };
    }

    // Freeze the send decision at schedule time, INSIDE a step, so its result is
    // memoized. A `Date.now()` comparison outside a step would be re-checked on the
    // wake replay against the elapsed clock and flip. The send instant is clamped
    // into the daytime window so a timer never texts in the small hours; a send
    // that clamps to at/after the appointment is dropped. Number, not Date.
    const plan = await step.run("plan-reminder", () => {
      const startMs = new Date(initial.startIso).getTime();
      const sendMs = clampToDaytime(
        startMs - env.reminderLeadHours * 60 * 60 * 1000,
        REMINDER_DAYTIME_START_HOUR,
        REMINDER_DAYTIME_END_HOUR,
      );
      return { sendMs, due: sendMs > Date.now() && sendMs < startMs };
    });
    if (!plan.due) {
      // Same-day booking (the confirmation already covers it) or the nudge clamped
      // to at/after the appointment (e.g. a very early slot). Nothing to send.
      return { skipped: "no nudge due" };
    }

    await step.sleepUntil("wait-for-nudge", new Date(plan.sendMs));

    const fresh = await step.run("recheck-booking", () => getBookingById(bookingId));
    if (!fresh || fresh.status !== "confirmed") {
      return { stopped: "no longer confirmed after wait" };
    }

    // The send is its own step, so a retry re-runs only the send (no re-sleep, no
    // double-text).
    await step.run("send-nudge", async () => {
      await sendBookingReminder(fresh);
      return { sent: true };
    });

    return { sent: true, bookingId };
  },
);

export const functions = [bookingReminder];
