import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth, isAdminSession } from "@/lib/auth";
import { getUpcomingBookings, getUpcomingTimeOff } from "@/lib/db";
import { formatDayLabel, formatTime } from "@/lib/time";
import { SHOP } from "@/lib/business-hours";
import { AddTimeOffForm } from "@/components/AddTimeOffForm";
import { cancelBookingAction, markDoneAction, markNoShowAction, logoutAdmin } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  cancelled: "Cancelled",
  completed: "Done",
  no_show: "No-show",
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!isAdminSession(session)) redirect("/admin/login");

  const [bookings, timeOff] = await Promise.all([
    getUpcomingBookings(),
    getUpcomingTimeOff(),
  ]);
  const confirmedCount = bookings.filter((b) => b.status === "confirmed").length;

  return (
    <div className="page">
      <header className="topbar">
        <div className="wrap-wide topbar-inner">
          <span className="brand">
            <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: "var(--tang)", display: "inline-block" }} />
            <span className="brand-name">{SHOP.name}</span>
            <span className="mono admin-tag">Owner</span>
          </span>
          <div className="admin-nav">
            <a className="mono admin-navlink" href="/admin/dashboard">Dashboard</a>
            <form action={logoutAdmin}>
              <button type="submit" className="btn ghost sm on-ink">Sign out</button>
            </form>
          </div>
        </div>
      </header>

      <main className="wrap-wide admin-main">
        {/* Bookings */}
        <section className="admin-section">
          <div className="admin-section-head">
            <h2 className="admin-h2">Upcoming bookings</h2>
            <span className="mono admin-count">{confirmedCount} confirmed</span>
          </div>

          {bookings.length === 0 ? (
            <div className="empty">
              No upcoming bookings yet.
              <span className="mono">New bookings land here in real time</span>
            </div>
          ) : (
            <ul className="booking-list">
              {bookings.map((b) => {
                const start = new Date(b.startIso);
                const end = new Date(b.endIso);
                const inactive = b.status !== "confirmed";
                return (
                  <li key={b.id} className={`booking-row ${inactive ? "is-cancelled" : ""}`}>
                    <div className="br-when">
                      <span className="br-day">{formatDayLabel(start)}</span>
                      <span className="br-time mono">{formatTime(start)} &ndash; {formatTime(end)}</span>
                    </div>
                    <div className="br-what">
                      <span className="br-service">{b.serviceName}</span>
                      <span className="br-customer">
                        {b.customerName} &middot; <a href={`tel:${b.customerPhone.replace(/[^\d+]/g, "")}`}>{b.customerPhone}</a>
                        {b.customerEmail ? <> &middot; {b.customerEmail}</> : null}
                      </span>
                    </div>
                    <div className="br-actions">
                      {b.status === "confirmed" ? (
                        <>
                          <form action={markDoneAction}>
                            <input type="hidden" name="id" value={b.id} />
                            <button type="submit" className="btn ghost sm">Done</button>
                          </form>
                          <form action={markNoShowAction}>
                            <input type="hidden" name="id" value={b.id} />
                            <button type="submit" className="btn ghost sm">No-show</button>
                          </form>
                          <form action={cancelBookingAction}>
                            <input type="hidden" name="id" value={b.id} />
                            <button type="submit" className="btn ghost sm">Cancel</button>
                          </form>
                        </>
                      ) : (
                        <span className={`badge ${b.status === "completed" ? "badge-done" : "badge-muted"}`}>
                          {STATUS_LABEL[b.status] ?? b.status}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Time off */}
        <section className="admin-section">
          <div className="admin-section-head">
            <h2 className="admin-h2">Time off</h2>
            <span className="mono admin-count">{SHOP.tzLabel} time</span>
          </div>

          <div className="timeoff-grid">
            <div className="timeoff-add">
              <p className="section-label">Block out time</p>
              <AddTimeOffForm />
            </div>

            <div className="timeoff-list-wrap">
              <p className="section-label">Upcoming blocks</p>
              {timeOff.length === 0 ? (
                <div className="empty">
                  No time off scheduled.
                  <span className="mono">Lunch, a parts run, a closed afternoon</span>
                </div>
              ) : (
                <ul className="timeoff-list">
                  {timeOff.map((t) => {
                    const s = new Date(t.startsAtIso);
                    const e = new Date(t.endsAtIso);
                    return (
                      <li key={t.id} className="timeoff-row">
                        <span className="to-when">
                          <b>{formatDayLabel(s)}</b>{" "}
                          <span className="mono">{formatTime(s)} &ndash; {formatTime(e)}</span>
                        </span>
                        {t.reason ? <span className="to-reason">{t.reason}</span> : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap-wide foot-inner">
          <a className="mark-line" href="/">&larr; Customer booking page</a>
          <span className="mono">{SHOP.name} &middot; owner console</span>
        </div>
      </footer>
    </div>
  );
}
