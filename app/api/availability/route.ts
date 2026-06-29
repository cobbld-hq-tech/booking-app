import type { NextRequest } from "next/server";
import { getAvailableSlots } from "@/lib/db";
import { reportError } from "@/lib/sentry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/availability?serviceId=1&date=2026-06-30
// Returns the open start times for that service on that date. Best-effort display
// only — the booking insert is the real guard (see app/api/bookings/route.ts).
export async function GET(req: NextRequest): Promise<Response> {
  try {
    const { searchParams } = new URL(req.url);
    const serviceId = Number(searchParams.get("serviceId"));
    const date = searchParams.get("date") ?? "";

    if (!Number.isInteger(serviceId) || serviceId <= 0) {
      return Response.json({ error: "Invalid serviceId" }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return Response.json({ error: "Invalid date" }, { status: 400 });
    }

    const { service, slots } = await getAvailableSlots(serviceId, date);
    if (!service) {
      return Response.json({ error: "Unknown service" }, { status: 404 });
    }
    return Response.json({ slots });
  } catch (error) {
    await reportError(error, { route: "availability" });
    return Response.json({ error: "Could not load times. Please try again." }, { status: 500 });
  }
}
