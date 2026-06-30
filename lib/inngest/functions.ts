import { inngest } from "./client";
import { getBookingById, hasRebookedSince } from "../db";
import { sendBookingReminder, sendNoShowFollowup } from "../notify";
import { clampToDaytime } from "../time";
import { env } from "../env";
import { REMINDER_DAYTIME_START_HOUR, REMINDER_DAYTIME_END_HOUR } from "../business-hours";

// Phase 6: the same-day reminder nudge. The booking confirmation is a plain send
// on insert (see app/api/bookings/route.ts) — emailed when an address was given —
// so there is no separate day-ahead reminder. This durable function sends a single
// "see you soon" nudge REMINDER_LEAD_HOURS before the appointment.
//
// Canonical Inngest shape: the event fires, the function sleeps durably, it wakes
// and re-reads FRESH state, then it acts or stops. cancelOn kills the in-flight run
// the moment the booking reaches ANY terminal state (cancelled / completed /
// no_show), so it does not sit sleeping until its wake time; the post-sleep status
// re-read stays as the backstop.
export const bookingReminder = inngest.createFunction(
  {
    id: "booking-reminder",
    triggers: [{ event: "booking.created" }],
    cancelOn: [
      { event: "booking.cancelled", match: "data.bookingId" },
      { event: "booking.completed", match: "data.bookingId" },
      { event: "booking.no_show", match: "data.bookingId" },
    ],
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

// Phase 8: the no-show "sorry we missed you" sequence. When the owner marks a
// no-show, send up to three win-back touches over several days, sleeping between
// them and STOPPING the moment the customer rebooks. Each send is clamped to daytime
// so a touch never lands at 3am. Hard cap at three touches — no infinite nagging.
export const noShowFollowup = inngest.createFunction(
  { id: "no-show-followup", triggers: [{ event: "booking.no_show" }] },
  async ({ event, step }) => {
    const bookingId = event.data.bookingId as string;

    const booking = await step.run("load-booking", () => getBookingById(bookingId));
    if (!booking || booking.status !== "no_show") {
      return { skipped: "not a no-show" };
    }

    // Freeze the schedule at start time, INSIDE a step (memoized). Touch instants are
    // clamped into the daytime window. `since` anchors the rebooked stop-check at the
    // MISSED slot's start (not the mark time), so a rebooking made any time after the
    // missed appointment counts — even one made before the owner clicked No-show.
    const plan = await step.run("plan-followups", () => {
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      const clamp = (ms: number) =>
        clampToDaytime(ms, REMINDER_DAYTIME_START_HOUR, REMINDER_DAYTIME_END_HOUR);
      return {
        since: booking.startIso,
        touches: [clamp(now), clamp(now + 2 * day), clamp(now + 5 * day)],
      };
    });

    let sent = 0;
    for (let i = 0; i < plan.touches.length; i++) {
      await step.sleepUntil(`wait-touch-${i}`, new Date(plan.touches[i]));

      // The stop condition reads FRESH state after the wait: if they already rebooked,
      // we never touch them again.
      const rebooked = await step.run(`rebooked-check-${i}`, () =>
        hasRebookedSince(booking.customerPhone, booking.customerEmail, plan.since),
      );
      if (rebooked) return { stopped: "rebooked", touchesSent: sent };

      await step.run(`send-touch-${i}`, async () => {
        await sendNoShowFollowup(booking, i + 1);
        return { sent: true };
      });
      sent += 1;
    }

    return { done: true, touchesSent: sent };
  },
);

export const functions = [bookingReminder, noShowFollowup];
