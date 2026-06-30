import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth, isAdminSession } from "@/lib/auth";
import { getPaybackStats, getRecentActivity, getOverdueBookings } from "@/lib/db";
import { formatDayLabel, formatTime } from "@/lib/time";
import { SHOP } from "@/lib/business-hours";
import { logoutAdmin, markDoneAction, markNoShowAction } from "../actions";

export const dynamic = "force-dynamic";

const EVENT_LABEL: Record<string, string> = {
  "booking.created": "New booking",
  "booking.cancelled": "Cancelled",
  "booking.completed": "Marked done",
  "booking.no_show": "No-show",
};

function badgeClass(type: string): string {
  if (type === "booking.completed") return "badge-done";
  if (type === "booking.no_show" || type === "booking.cancelled") return "badge-muted";
  return "badge-tang";
}

export default async function DashboardPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!isAdminSession(session)) redirect("/admin/login");

  const [stats, activity, overdue] = await Promise.all([
    getPaybackStats(),
    getRecentActivity(14),
    getOverdueBookings(),
  ]);
  const served = stats.completed + stats.noShows;
  // Real appointments, excluding cancellations (which include reschedule churn).
  const booked = stats.confirmed + stats.completed + stats.noShows;
  const ratePct = stats.noShowRate * 100;
  const rateLabel = ratePct > 0 && ratePct < 1 ? "<1% of served" : `${Math.round(ratePct)}% of served`;

  const cards: { label: string; value: number; sub?: string }[] = [
    { label: "Total bookings", value: booked },
    { label: "Upcoming", value: stats.upcoming },
    { label: "Completed", value: stats.completed },
    { label: "No-shows", value: stats.noShows, sub: served > 0 && stats.noShows > 0 ? rateLabel : undefined },
    { label: "Cancelled", value: stats.cancelled },
  ];

  return (
    <div className="page">
      <header className="topbar">
        <div className="wrap-wide topbar-inner">
          <span className="brand">
            <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: "var(--tang)", display: "inline-block" }} />
            <span className="brand-name">{SHOP.name}</span>
            <span className="mono admin-tag">Dashboard</span>
          </span>
          <div className="admin-nav">
            <a className="mono admin-navlink" href="/admin">Bookings</a>
            <form action={logoutAdmin}>
              <button type="submit" className="btn ghost sm on-ink">Sign out</button>
            </form>
          </div>
        </div>
      </header>

      <main className="wrap-wide admin-main">
        <section className="admin-section">
          <div className="admin-section-head">
            <h2 className="admin-h2">What this booked you</h2>
            <span className="mono admin-count">from the event log</span>
          </div>
          <div className="metric-grid">
            {cards.map((c) => (
              <div className="metric-card" key={c.label}>
                <span className="metric-label mono">{c.label}</span>
                <span className="metric-value">{c.value.toLocaleString()}</span>
                {c.sub ? <span className="metric-sub mono">{c.sub}</span> : null}
              </div>
            ))}
          </div>
        </section>

        <section className="admin-section">
          <div className="admin-section-head">
            <h2 className="admin-h2">Needs review</h2>
            <span className="mono admin-count">{overdue.length} past due</span>
          </div>
          {overdue.length === 0 ? (
            <div className="empty">
              All caught up.
              <span className="mono">Past appointments waiting to be closed out show here</span>
            </div>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Service</th>
                    <th>Customer</th>
                    <th className="ta-right">Close out</th>
                  </tr>
                </thead>
                <tbody>
                  {overdue.map((b) => {
                    const start = new Date(b.startIso);
                    return (
                      <tr key={b.id}>
                        <td className="dt-when mono" data-label="When">{formatDayLabel(start)}, {formatTime(start)}</td>
                        <td className="dt-strong" data-label="Service">{b.serviceName}</td>
                        <td className="dt-muted" data-label="Customer">{b.customerName}</td>
                        <td className="ta-right" data-label="Close out">
                          <div className="row-actions">
                            <form action={markDoneAction}>
                              <input type="hidden" name="id" value={b.id} />
                              <button type="submit" className="btn sm">Done</button>
                            </form>
                            <form action={markNoShowAction}>
                              <input type="hidden" name="id" value={b.id} />
                              <button type="submit" className="btn ghost sm">No-show</button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="admin-section">
          <div className="admin-section-head">
            <h2 className="admin-h2">Recent activity</h2>
            <span className="mono admin-count">the spine, live</span>
          </div>
          {activity.length === 0 ? (
            <div className="empty">
              No activity yet.
              <span className="mono">Every booking, cancel, and no-show lands here</span>
            </div>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Customer</th>
                    <th>Service</th>
                    <th className="ta-right">When</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.map((a, i) => {
                    const d = new Date(a.createdAtIso);
                    return (
                      <tr key={i}>
                        <td><span className={`badge ${badgeClass(a.type)}`}>{EVENT_LABEL[a.type] ?? a.type}</span></td>
                        <td className="dt-strong" data-label="Customer">{a.customerName ?? "—"}</td>
                        <td className="dt-muted" data-label="Service">{a.serviceName ?? "—"}</td>
                        <td className="dt-when mono ta-right">{formatDayLabel(d)}, {formatTime(d)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <footer className="foot">
        <div className="wrap-wide foot-inner">
          <a className="mark-line" href="/admin">&larr; Owner console</a>
          <span className="mono">{SHOP.name} &middot; dashboard</span>
        </div>
      </footer>
    </div>
  );
}
