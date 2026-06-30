import { inngest } from "./client";
import { getBookingById } from "../db";
import { sendBookingReminder } from "../notify";
import { clampToDaytime } from "../time";
import { env } from "../env";
import { REMINDER_DAYTIME_START_HOUR, REMINDER_DAYTIME_END_HOUR } from "../business-hours";

// Phase 6: the appointment reminders. Two durable waits hang off one booking:
// a day-ahead reminder (its job is to give time to reschedule, which lets the
// shop refill the slot) and a same-day "see you soon" nudge. The canonical
// Inngest shape: an event fires, the function sleeps, it wakes and re-reads FRESH
// state, then it acts or stops. cancelOn kills the whole run on cancellation; the
// post-sleep status re-reads are the backstop (and also catch completed/no_show).
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

    // Freeze BOTH reminder decisions at schedule time, INSIDE a step, so the
    // results are memoized. If `<= Date.now()` were evaluated outside a step it
    // would be re-checked against the elapsed clock on every wake replay and flip
    // (the bug that silently skipped the single reminder). The send instants are
    // pulled into the daytime window so neither reminder texts in the small hours
    // (under any lead, across DST); a send that clamps to at/after the appointment
    // is dropped. Values are numbers — step results must be JSON-serializable.
    const plan = await step.run("plan-reminders", () => {
      const startMs = new Date(initial.startIso).getTime();
      const now = Date.now();
      const aheadMs = clampToDaytime(
        startMs - env.reminderLeadHours * 60 * 60 * 1000,
        REMINDER_DAYTIME_START_HOUR,
        REMINDER_DAYTIME_END_HOUR,
      );
      const soonMs = clampToDaytime(
        startMs - env.secondReminderLeadHours * 60 * 60 * 1000,
        REMINDER_DAYTIME_START_HOUR,
        REMINDER_DAYTIME_END_HOUR,
      );
      return {
        // Drop a reminder whose (clamped) send time is in the past or at/after the
        // appointment. The nudge must also land strictly after the day-ahead one.
        ahead: { ms: aheadMs, due: aheadMs > now && aheadMs < startMs },
        soon: { ms: soonMs, due: soonMs > now && soonMs < startMs && soonMs > aheadMs },
      };
    });

    // Stage 1 — day-ahead reminder.
    if (plan.ahead.due) {
      await step.sleepUntil("wait-ahead", new Date(plan.ahead.ms));
      const fresh = await step.run("recheck-ahead", () => getBookingById(bookingId));
      if (!fresh || fresh.status !== "confirmed") {
        return { stopped: "no longer confirmed before day-ahead reminder" };
      }
      // Each send is its own step, so a retry re-runs only the send (no re-sleep,
      // no double-text).
      await step.run("send-ahead", async () => {
        await sendBookingReminder(fresh, "ahead");
        return { sent: true };
      });
    }

    // Stage 2 — same-day "see you soon" nudge (always later than stage 1, so the
    // sleeps are correctly ordered).
    if (plan.soon.due) {
      await step.sleepUntil("wait-soon", new Date(plan.soon.ms));
      const fresh = await step.run("recheck-soon", () => getBookingById(bookingId));
      if (!fresh || fresh.status !== "confirmed") {
        return { stopped: "no longer confirmed before same-day reminder" };
      }
      await step.run("send-soon", async () => {
        await sendBookingReminder(fresh, "soon");
        return { sent: true };
      });
    }

    return {
      done: true,
      bookingId,
      aheadSent: plan.ahead.due,
      soonSent: plan.soon.due,
    };
  },
);

export const functions = [bookingReminder];
