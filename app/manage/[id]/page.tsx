import { getBookingById } from "@/lib/db";
import { formatLongDate, formatTime } from "@/lib/time";
import { SHOP } from "@/lib/business-hours";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cancelOwnBooking } from "./actions";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { heading: string; line: string; mark: string; muted: boolean }> = {
  confirmed: { heading: "You're booked.", line: "You're all set. See you then.", mark: "✓", muted: false },
  cancelled: { heading: "Booking cancelled.", line: "This booking has been cancelled.", mark: "✕", muted: true },
  completed: { heading: "All done.", line: "Thanks for coming in.", mark: "✓", muted: false },
  no_show: { heading: "Missed appointment.", line: "This appointment was marked as missed.", mark: "–", muted: true },
};

function Shell({ children }: { children: React.ReactNode }) {
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
      <main className="wrap">{children}</main>
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

export default async function ManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ rescheduled?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const booking = await getBookingById(id);

  if (!booking) {
    return (
      <Shell>
        <section className="hero">
          <p className="mono eyebrow">Manage your booking</p>
          <h1>We couldn&rsquo;t find that booking.</h1>
          <p className="lead">The link may be out of date. If you just rescheduled, use the newest confirmation. Otherwise give us a call.</p>
        </section>
        <div className="actions" style={{ marginBottom: "4rem" }}>
          <a className="btn" href="/">Book a service <span className="arr" aria-hidden="true">&rarr;</span></a>
          <a className="btn ghost" href={SHOP.phoneHref}>Call {SHOP.phone}</a>
        </div>
      </Shell>
    );
  }

  const start = new Date(booking.startIso);
  const end = new Date(booking.endIso);
  const s = STATUS[booking.status] ?? { heading: booking.status, line: "", mark: "•", muted: true };
  const isConfirmed = booking.status === "confirmed";

  return (
    <Shell>
      <div className="confirm-wrap">
        <p className="mono eyebrow" style={{ textAlign: "center", marginBottom: 16 }}>Manage your booking</p>

        {sp.rescheduled ? (
          <div className="conflict" role="status" style={{ marginBottom: 16 }}>
            <span className="dot" aria-hidden="true" />
            <div>
              <b>Rescheduled.</b>
              <p>Here&rsquo;s your new time. We sent an updated confirmation.</p>
            </div>
          </div>
        ) : null}

        <div className="confirm-card">
          <div className="confirm-head">
            <div className={`check ${s.muted ? "muted" : ""}`} aria-hidden="true">{s.mark}</div>
            <h2>{s.heading}</h2>
            <p>{s.line}</p>
          </div>
          <div className="confirm-body">
            <div className="confirm-row"><span className="k">Service</span><span className="v">{booking.serviceName}</span></div>
            <div className="confirm-row"><span className="k">Date</span><span className="v">{formatLongDate(start)}</span></div>
            <div className="confirm-row"><span className="k">Time</span><span className="v mono-time">{formatTime(start)} &ndash; {formatTime(end)} {SHOP.tzLabel}</span></div>
            <div className="confirm-row"><span className="k">Name</span><span className="v">{booking.customerName}</span></div>
            <div className="confirm-row"><span className="k">Ref</span><span className="v mono-time">{booking.id.slice(0, 8).toUpperCase()}</span></div>

            {isConfirmed ? (
              <div className="actions">
                <a className="btn" href={`/manage/${booking.id}/reschedule`}>Reschedule <span className="arr" aria-hidden="true">&rarr;</span></a>
                <form action={cancelOwnBooking}>
                  <input type="hidden" name="id" value={booking.id} />
                  <button type="submit" className="btn ghost">Cancel booking</button>
                </form>
              </div>
            ) : (
              <div className="actions">
                <a className="btn" href="/">Book again <span className="arr" aria-hidden="true">&rarr;</span></a>
              </div>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
