import type { NextRequest } from "next/server";
import { createBooking, getAvailableSlots } from "@/lib/db";
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
      // TODO: send confirmation (Twilio SMS / Resend email). For the POC the
      // confirmation is on-screen only; this success branch is the hook where a
      // real immediate confirmation send would fire.
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
