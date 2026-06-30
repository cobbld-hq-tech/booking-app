import { getActiveServices } from "@/lib/db";
import { listUpcomingDays } from "@/lib/time";
import { BUSINESS_HOURS, SHOP, HOURS_DISPLAY, BOOKING_WINDOW_DAYS } from "@/lib/business-hours";
import { BookingFlow } from "@/components/BookingFlow";
import { BrandMark } from "@/components/BrandMark";

// Always render against live data — services and the day list reflect the
// current DB / clock at request time (not baked in at build).
export const dynamic = "force-dynamic";

export default async function Home() {
  const services = await getActiveServices();
  const days = listUpcomingDays(BOOKING_WINDOW_DAYS, (weekday) => BUSINESS_HOURS[weekday] !== null);

  return (
    <div className="page">
      <header className="topbar">
        <div className="wrap-wide topbar-inner">
          <span className="brand">
            <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: "var(--tang)", display: "inline-block" }} />
            <span className="brand-name">{SHOP.name}</span>
          </span>
          <div className="topbar-meta">
            <a href={SHOP.phoneHref} className="mono">{SHOP.phone}</a>
            <span className="mono">{SHOP.city}</span>
          </div>
        </div>
      </header>

      <main>
        <section className="hero wrap">
          <p className="mono eyebrow">{SHOP.name} &middot; {SHOP.city}</p>
          <h1>Book the bay. It&rsquo;s yours the second you confirm.</h1>
          <p className="lead">
            Pick a service, pick a time, you&rsquo;re on the schedule. No phone tag. When a
            slot is taken it&rsquo;s <em>gone</em>, the instant someone confirms it.
          </p>
        </section>

        <div className="wrap">
          <BookingFlow
            services={services}
            days={days}
            shopName={SHOP.name}
            tzLabel={SHOP.tzLabel}
          />
        </div>
      </main>

      <footer className="foot">
        <div className="wrap-wide foot-inner">
          <a className="mark-line" href="https://cobbld.com" target="_blank" rel="noopener noreferrer">
            <BrandMark onInk />
            <span>built by cobbld</span>
          </a>
          <span className="mono">
            {HOURS_DISPLAY.map((h) => `${h.label} ${h.value}`).join("  ·  ")}
          </span>
        </div>
      </footer>
    </div>
  );
}
