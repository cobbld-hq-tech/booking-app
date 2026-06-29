import { inngest } from "./client";
import { getBookingById } from "../db";
import { sendBookingReminder } from "../notify";
import { env } from "../env";

// Phase 6: the 24h reminder. This is the canonical Inngest shape — an event fires,
// the function sleeps durably, it wakes and re-reads FRESH state, then it either
// acts or stops. The stop condition reads real data after the sleep, never a
// decision made before it.
export const bookingReminder = inngest.createFunction(
  {
    id: "booking-reminder",
    triggers: [{ event: "booking.created" }],
    // The cleanest cancellation: if the booking is cancelled, kill the in-flight
    // run outright. The post-sleep status re-read below is the backstop.
    cancelOn: [{ event: "booking.cancelled", match: "data.bookingId" }],
  },
  async ({ event, step }) => {
    const bookingId = event.data.bookingId as string;

    // Load the booking to compute when the reminder is due.
    const initial = await step.run("load-booking", () => getBookingById(bookingId));
    if (!initial || initial.status !== "confirmed") {
      return { skipped: "not confirmed when scheduled" };
    }

    // Freeze the schedule-time decision INSIDE a step so its result is memoized.
    // Critical: if `reminderMs <= Date.now()` were evaluated outside a step, the
    // wake replay (which re-runs all non-step code) would re-check it against the
    // now-elapsed clock, flip it true, and skip the send. Returning a number, not
    // a Date — step results must be JSON-serializable.
    const plan = await step.run("plan-reminder", () => {
      const startMs = new Date(initial.startIso).getTime();
      const reminderMs = startMs - env.reminderLeadHours * 60 * 60 * 1000;
      return { reminderMs, withinLeadWindow: reminderMs <= Date.now() };
    });
    if (plan.withinLeadWindow) {
      // Booked inside the lead window (e.g. same-day). The confirmation already
      // covers it, so we skip the reminder rather than send a near-duplicate.
      return { skipped: "within reminder lead window" };
    }

    // The durable wait. This is the entire reason this job is Inngest and not a
    // plain send: the function can sleep for hours or days and resume exactly.
    await step.sleepUntil("wait-until-reminder", new Date(plan.reminderMs));

    // Re-read fresh state AFTER the wait. cancelOn already kills cancelled runs;
    // this also stops a booking that was marked completed / no_show meanwhile.
    const fresh = await step.run("recheck-booking", () => getBookingById(bookingId));
    if (!fresh || fresh.status !== "confirmed") {
      return { stopped: "no longer confirmed after wait" };
    }

    // Each outbound send is its own step, so a later retry re-runs only the send
    // and never re-sleeps or double-texts.
    await step.run("send-reminder", async () => {
      await sendBookingReminder(fresh);
      return { sent: true };
    });

    return { sent: true, bookingId };
  },
);

export const functions = [bookingReminder];
