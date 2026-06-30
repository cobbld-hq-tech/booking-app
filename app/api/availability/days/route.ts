import type { NextRequest } from "next/server";
import { getAvailableDates } from "@/lib/db";
import { listUpcomingDays } from "@/lib/time";
import { BUSINESS_HOURS } from "@/lib/business-hours";
import { reportError } from "@/lib/sentry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/availability/days?serviceId=1
// Which of the next 14 shop-local days actually have an open start time for the
// service — so the UI can disable empty (closed, fully-booked, or all-past) days.
export async function GET(req: NextRequest): Promise<Response> {
  try {
    const serviceId = Number(new URL(req.url).searchParams.get("serviceId"));
    if (!Number.isInteger(serviceId) || serviceId <= 0) {
      return Response.json({ error: "Invalid serviceId" }, { status: 400 });
    }
    const openDays = listUpcomingDays(14, (weekday) => BUSINESS_HOURS[weekday] !== null)
      .filter((d) => d.isOpen)
      .map((d) => d.dateStr);
    const availableDates = await getAvailableDates(serviceId, openDays);
    return Response.json({ availableDates });
  } catch (error) {
    await reportError(error, { route: "availability/days" });
    return Response.json({ error: "Could not load availability." }, { status: 500 });
  }
}
