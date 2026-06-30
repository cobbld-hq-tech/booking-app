import { redirect } from "next/navigation";
import { getBookingById } from "@/lib/db";
import { listUpcomingDays, formatLongDate, formatTime } from "@/lib/time";
import { BUSINESS_HOURS, SHOP, BOOKING_WINDOW_DAYS } from "@/lib/business-hours";
import { BrandMark } from "@/components/BrandMark";
import { RescheduleFlow } from "@/components/RescheduleFlow";
import { ThemeToggle } from "@/components/ThemeToggle";

export const dynamic = "force-dynamic";

export default async function ReschedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const booking = await getBookingById(id);
  if (!booking || booking.status !== "confirmed") {
    redirect(`/manage/${id}`);
  }

  const days = listUpcomingDays(BOOKING_WINDOW_DAYS, (weekday) => BUSINESS_HOURS[weekday] !== null);
  const start = new Date(booking.startIso);

  return (
    <div className="page">
      <header className="topbar">
        <div className="wrap-wide topbar-inner">
          <a className="brand" href="/">
            <span className="brand-dot" aria-hidden="true" />
            <span className="brand-name">{SHOP.name}</span>
          </a>
          <div className="topbar-meta">
            <span className="tb-contact">
              <a href={SHOP.phoneHref} className="mono">{SHOP.phone}</a>
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="wrap">
        <div style={{ padding: "40px 0 64px" }}>
          <a className="step-back" href={`/manage/${booking.id}`}>&larr; Back to booking</a>
          <p className="book-eyebrow">Reschedule</p>
          <h2 className="book-h2">Pick a new time</h2>
          <p className="book-sub">{booking.serviceName} &middot; Central time</p>
          <p className="book-footnote" style={{ marginTop: 0, marginBottom: 22 }}>
            Currently booked for {formatLongDate(start)} at {formatTime(start)} {SHOP.tzLabel}.
          </p>

          <RescheduleFlow bookingId={booking.id} serviceId={booking.serviceId} days={days} />
        </div>
      </main>

      <footer className="foot">
        <div className="wrap-wide foot-inner">
          <a className="mark-line" href="https://cobbld.com" target="_blank" rel="noopener noreferrer">
            <BrandMark />
            <span>Built by cobbld</span>
          </a>
          <span className="mono">{SHOP.name} &middot; {SHOP.city}</span>
        </div>
      </footer>
    </div>
  );
}
