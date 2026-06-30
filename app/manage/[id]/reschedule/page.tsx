import { redirect } from "next/navigation";
import { getBookingById } from "@/lib/db";
import { listUpcomingDays, formatLongDate, formatTime } from "@/lib/time";
import { BUSINESS_HOURS, SHOP } from "@/lib/business-hours";
import { BrandMark } from "@/components/BrandMark";
import { RescheduleFlow } from "@/components/RescheduleFlow";

export const dynamic = "force-dynamic";

export default async function ReschedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const booking = await getBookingById(id);
  if (!booking || booking.status !== "confirmed") {
    redirect(`/manage/${id}`);
  }

  const days = listUpcomingDays(14, (weekday) => BUSINESS_HOURS[weekday] !== null);
  const start = new Date(booking.startIso);

  return (
    <div className="page">
      <header className="topbar">
        <div className="wrap-wide topbar-inner">
          <a className="brand" href="/" style={{ textDecoration: "none" }}>
            <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: "var(--tang)", display: "inline-block" }} />
            <span className="brand-name">{SHOP.name}</span>
          </a>
          <div className="topbar-meta">
            <a href={SHOP.phoneHref} className="mono">{SHOP.phone}</a>
          </div>
        </div>
      </header>

      <main className="wrap">
        <section className="hero">
          <p className="mono eyebrow">Reschedule</p>
          <h1>Pick a new time.</h1>
          <p className="lead">
            Currently booked for <em>{formatLongDate(start)} at {formatTime(start)} {SHOP.tzLabel}</em>.
            Choose a new slot and we&rsquo;ll move it over.
          </p>
        </section>

        <RescheduleFlow
          bookingId={booking.id}
          serviceId={booking.serviceId}
          serviceName={booking.serviceName}
          days={days}
          tzLabel={SHOP.tzLabel}
        />

        <div className="actions" style={{ marginBottom: "3rem" }}>
          <a className="btn ghost" href={`/manage/${booking.id}`}>&larr; Back to booking</a>
        </div>
      </main>

      <footer className="foot">
        <div className="wrap-wide foot-inner">
          <a className="mark-line" href="https://cobbld.com" target="_blank" rel="noopener noreferrer">
            <BrandMark onInk />
            <span>built by cobbld</span>
          </a>
          <span className="mono">{SHOP.name} &middot; {SHOP.city}</span>
        </div>
      </footer>
    </div>
  );
}
