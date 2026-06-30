"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { DayOption } from "@/lib/time";

interface Props {
  /** The bookable window (server-computed in shop time): today + the next days. */
  days: DayOption[];
  /** Which dates actually have an open slot for the chosen service; null = unknown. */
  availableDates: Set<string> | null;
  /** Selected shop-local date string ("YYYY-MM-DD"), or null. */
  selected: string | null;
  onSelect: (day: DayOption) => void;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function monthIndex(dateStr: string): number {
  const [y, m] = dateStr.split("-").map(Number);
  return y * 12 + (m - 1);
}

/**
 * Month-grid date picker. The authoritative open/closed/today/in-window facts come
 * from the server-computed `days` (shop timezone); the grid itself is laid out with
 * plain UTC calendar math (just positioning numbers, no timezone meaning). Month
 * navigation is clamped to the bookable window.
 */
export function Calendar({ days, availableDates, selected, onSelect }: Props) {
  const minIdx = monthIndex(days[0].dateStr);
  const maxIdx = monthIndex(days[days.length - 1].dateStr);
  const [cur, setCur] = useState(minIdx);

  const byDate = useMemo(() => {
    const m = new Map<string, DayOption>();
    for (const d of days) m.set(d.dateStr, d);
    return m;
  }, [days]);

  // Keep the visible month in step with an out-of-view selection (e.g. after a
  // conflict bounce keeps a date selected).
  useEffect(() => {
    if (!selected) return;
    const idx = monthIndex(selected);
    if (idx >= minIdx && idx <= maxIdx) setCur(idx);
  }, [selected, minIdx, maxIdx]);

  const year = Math.floor(cur / 12);
  const month0 = cur % 12;
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month0, 1)));
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const leadingBlanks = new Date(Date.UTC(year, month0, 1)).getUTCDay();

  const cells: ReactNode[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(<span key={`b${i}`} />);
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${pad2(month0 + 1)}-${pad2(d)}`;
    const opt = byDate.get(ds);
    const bookable = !!opt && opt.isOpen && (availableDates === null || availableDates.has(ds));
    const isToday = !!opt && opt.isToday;
    const isSel = ds === selected;
    cells.push(
      <button
        key={ds}
        type="button"
        className={`cal-cell ${isSel ? "selected" : ""} ${isToday ? "today" : ""}`}
        disabled={!bookable}
        aria-pressed={isSel}
        aria-label={opt ? `${opt.weekdayShort}, ${opt.monthShort} ${d}` : undefined}
        title={opt && !opt.isOpen ? "Closed" : opt && !bookable ? "No open times" : undefined}
        onClick={() => opt && onSelect(opt)}
      >
        {d}
      </button>,
    );
  }

  return (
    <div className="cal">
      <div className="cal-head">
        <span className="cal-label">{monthLabel}</span>
        <div className="cal-navs">
          <button
            type="button"
            className="cal-nav"
            disabled={cur <= minIdx}
            aria-label="Previous month"
            onClick={() => setCur((c) => Math.max(minIdx, c - 1))}
          >
            &lsaquo;
          </button>
          <button
            type="button"
            className="cal-nav"
            disabled={cur >= maxIdx}
            aria-label="Next month"
            onClick={() => setCur((c) => Math.min(maxIdx, c + 1))}
          >
            &rsaquo;
          </button>
        </div>
      </div>
      <div className="cal-wd-row" aria-hidden="true">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="cal-wd">{w}</span>
        ))}
      </div>
      <div className="cal-grid" role="grid">{cells}</div>
    </div>
  );
}
