"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cancelBooking, rescheduleBooking } from "@/lib/db";
import { emitBookingEvent } from "@/lib/events";
import { sendBookingConfirmation } from "@/lib/notify";
import { reportError } from "@/lib/sentry";

export interface ManageState {
  error?: string;
}

/** Customer cancels their own booking (the unguessable booking id is the auth). */
export async function cancelOwnBooking(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (id) {
    try {
      const cancelled = await cancelBooking(id);
      // Frees the slot and cancels the pending reminder (cancelOn).
      if (cancelled) await emitBookingEvent("booking.cancelled", { bookingId: id });
    } catch (error) {
      await reportError(error, { route: "manage/cancel" });
    }
  }
  revalidatePath(`/manage/${id}`);
}

/** Customer reschedules to a new slot. The DB does the safe swap; here we emit the
 *  events (old reminder off, new reminder on) and send a fresh confirmation. */
export async function rescheduleAction(_prev: ManageState, formData: FormData): Promise<ManageState> {
  const oldId = String(formData.get("id") ?? "");
  const date = String(formData.get("date") ?? "");
  const startIso = String(formData.get("startIso") ?? "");
  if (!oldId || !date || !startIso) return { error: "Pick a new time first." };

  let newId: string | null = null;
  try {
    const result = await rescheduleBooking(oldId, date, startIso);
    if (!result.ok) {
      if (result.reason === "conflict") return { error: "That time was just taken. Pick another." };
      if (result.reason === "not_found") return { error: "We couldn't find that booking." };
      return { error: result.message ?? "Could not reschedule. Please try again." };
    }
    newId = result.newBooking.id;
    // Mirror the create route: a dropped event/confirmation must not fail the
    // reschedule, but it must be visible — a dropped booking.created would skip the
    // new reminder.
    const settled = await Promise.allSettled([
      emitBookingEvent("booking.cancelled", { bookingId: result.oldBookingId }),
      emitBookingEvent("booking.created", {
        bookingId: result.newBooking.id,
        startIso: result.newBooking.startIso,
      }),
      sendBookingConfirmation({
        id: result.newBooking.id,
        serviceName: result.newBooking.serviceName,
        customerName: result.newBooking.customerName,
        customerPhone: result.customerPhone,
        customerEmail: result.customerEmail,
        startIso: result.newBooking.startIso,
      }),
    ]);
    for (const r of settled) {
      if (r.status === "rejected") await reportError(r.reason, { route: "manage/reschedule/notify" });
    }
  } catch (error) {
    await reportError(error, { route: "manage/reschedule" });
    return { error: "Something went wrong. Please try again." };
  }

  if (!newId) return { error: "Could not reschedule. Please try again." };
  redirect(`/manage/${newId}?rescheduled=1`);
}
