import type { NextRequest } from "next/server";
import { createBooking, getAvailableSlots } from "@/lib/db";
import { sendBookingConfirmation } from "@/lib/notify";
import { emitBookingEvent } from "@/lib/events";
import { reportError } from "@/lib/sentry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/bookings — attempt to claim a slot. The INSERT is the claim: there is
// no read-then-write here. createBooking just inserts; if a confirmed booking
// already overlaps, Postgres raises the exclusion violation and we return a clean
// 409 with refreshed times so the customer can pick again. The conflict is
// expected flow and is deliberately NOT reported to Sentry.
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json({ ok: false, reason: "invalid", message: "Invalid request." }, { status: 400 });
    }

    const { serviceId, date, startIso, name, phone, email } = body as Record<string, unknown>;
    const result = await createBooking({
      serviceId: Number(serviceId),
      dateStr: String(date ?? ""),
      startIso: String(startIso ?? ""),
      customerName: String(name ?? ""),
      customerPhone: String(phone ?? ""),
      customerEmail: email ? String(email) : null,
    });

    if (result.ok) {
      // The immediate confirmation is a plain send on insert success (no wait),
      // and booking.created goes onto the event spine — which schedules the 24h
      // reminder and feeds payback measurement. Neither may FAIL the booking, but
      // a failure must not vanish either: allSettled keeps the booking safe, and
      // we report any rejection so a dropped confirmation or (worse) a dropped
      // booking.created that would skip the reminder is visible in Sentry.
      const notifyResults = await Promise.allSettled([
        sendBookingConfirmation({
          serviceName: result.booking.serviceName,
          customerName: result.booking.customerName,
          customerPhone: String(phone ?? ""),
          customerEmail: email ? String(email) : null,
          startIso: result.booking.startIso,
        }),
        emitBookingEvent("booking.created", {
          bookingId: result.booking.id,
          startIso: result.booking.startIso,
        }),
      ]);
      for (const r of notifyResults) {
        if (r.status === "rejected") {
          await reportError(r.reason, { route: "bookings/notify" });
        }
      }
      return Response.json({ ok: true, booking: result.booking });
    }

    if (result.reason === "conflict") {
      const { slots } = await getAvailableSlots(Number(serviceId), String(date ?? ""));
      return Response.json({ ok: false, reason: "conflict", slots }, { status: 409 });
    }

    return Response.json(
      { ok: false, reason: "invalid", message: result.message },
      { status: 400 },
    );
  } catch (error) {
    await reportError(error, { route: "bookings" });
    return Response.json(
      { ok: false, reason: "error", message: "Something went wrong on our end. Please try again." },
      { status: 500 },
    );
  }
}
