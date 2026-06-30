import { getActiveServices } from "@/lib/db";
import { listUpcomingDays } from "@/lib/time";
import { BUSINESS_HOURS, SHOP, HOURS_DISPLAY, BOOKING_WINDOW_DAYS } from "@/lib/business-hours";
import { BookingFlow } from "@/components/BookingFlow";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";

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
            <span className="brand-dot" aria-hidden="true" />
            <span className="brand-name">{SHOP.name}</span>
          </span>
          <div className="topbar-meta">
            <span className="tb-contact">
              <a href={SHOP.phoneHref} className="mono">{SHOP.phone}</a>
              <span className="mono">{SHOP.city}</span>
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main>
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
            <BrandMark />
            <span>Built by cobbld</span>
          </a>
          <span className="mono">
            {HOURS_DISPLAY.map((h) => `${h.label} ${h.value}`).join("  ·  ")}
          </span>
        </div>
      </footer>
    </div>
  );
}
