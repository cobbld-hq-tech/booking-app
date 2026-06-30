"use client";

import { useState } from "react";
// Pure Intl formatters — safe in the browser bundle.
import { formatDayLabel, formatTime } from "@/lib/time";
// Server actions imported into a client component: usable in <form action>.
import { markDoneAction, markNoShowAction } from "@/app/admin/actions";

export interface OverdueItem {
  id: string;
  serviceName: string;
  customerName: string;
  customerPhone: string;
  startIso: string;
}

/**
 * Header notification bell for the dashboard. Lights up when confirmed jobs are
 * past their due day and still unclosed; the panel lists them with Done / No-show
 * so the owner closes them out in place. The action revalidates the dashboard, so
 * a closed job drops off the list while the panel stays open.
 */
export function OverdueAlerts({ items }: { items: OverdueItem[] }) {
  const [open, setOpen] = useState(false);
  const count = items.length;

  return (
    <div className="notif">
      <button
        type="button"
        className={`notif-btn ${count > 0 ? "has-alert" : ""}`}
        aria-label={count > 0 ? `${count} job${count === 1 ? "" : "s"} need closing out` : "No alerts"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && <span className="notif-badge">{count}</span>}
      </button>

      {open && (
        <>
          <button type="button" className="notif-backdrop" aria-label="Close alerts" onClick={() => setOpen(false)} />
          <div className="notif-panel" role="dialog" aria-label="Jobs to close out">
            <div className="notif-head">
              <span className="notif-title">Needs closing out</span>
              <span className="mono notif-sub">
                {count === 0 ? "all clear" : `${count} past job${count === 1 ? "" : "s"}`}
              </span>
            </div>

            {count === 0 ? (
              <p className="notif-empty">You&apos;re all caught up. No past appointments waiting to be closed out.</p>
            ) : (
              <ul className="notif-list">
                {items.map((b) => {
                  const start = new Date(b.startIso);
                  return (
                    <li className="notif-item" key={b.id}>
                      <div className="notif-when">
                        <span className="notif-day">{formatDayLabel(start)}</span>
                        <span className="mono notif-time">{formatTime(start)}</span>
                      </div>
                      <div className="notif-what">
                        <span className="notif-svc">{b.serviceName}</span>
                        <span className="notif-cust">{b.customerName} &middot; {b.customerPhone}</span>
                      </div>
                      <div className="notif-actions">
                        <form action={markDoneAction}>
                          <input type="hidden" name="id" value={b.id} />
                          <button type="submit" className="btn sm">Done</button>
                        </form>
                        <form action={markNoShowAction}>
                          <input type="hidden" name="id" value={b.id} />
                          <button type="submit" className="btn ghost sm">No-show</button>
                        </form>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
