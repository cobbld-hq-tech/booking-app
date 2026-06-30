"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import type { AvailableSlot } from "@/lib/db";
import type { DayOption } from "@/lib/time";
import { rescheduleAction, type ManageState } from "@/app/manage/[id]/actions";

interface Props {
  bookingId: string;
  serviceId: number;
  serviceName: string;
  days: DayOption[];
  tzLabel: string;
}

const initial: ManageState = {};

export function RescheduleFlow({ bookingId, serviceId, serviceName, days, tzLabel }: Props) {
  const [day, setDay] = useState<DayOption | null>(null);
  const [slots, setSlots] = useState<AvailableSlot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [slot, setSlot] = useState<AvailableSlot | null>(null);
  const [state, action, pending] = useActionState(rescheduleAction, initial);
  const [availableDates, setAvailableDates] = useState<Set<string> | null>(null);
  const [checkingDays, setCheckingDays] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch(`/api/availability/days?serviceId=${serviceId}`);
        const data = await res.json();
        if (active && res.ok) setAvailableDates(new Set<string>(data.availableDates ?? []));
      } catch {
        // leave null = unrestricted
      } finally {
        if (active) setCheckingDays(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [serviceId]);

  const loadSlots = useCallback(
    async (dateStr: string) => {
      setLoading(true);
      setSlotError(null);
      setSlots(null);
      setSlot(null);
      try {
        const res = await fetch(`/api/availability?serviceId=${serviceId}&date=${dateStr}`);
        const data = await res.json();
        if (!res.ok) {
          setSlotError(data.error ?? "Could not load times.");
          setSlots([]);
        } else {
          setSlots(data.slots ?? []);
        }
      } catch {
        setSlotError("Could not load times. Check your connection.");
        setSlots([]);
      } finally {
        setLoading(false);
      }
    },
    [serviceId],
  );

  function chooseDay(d: DayOption) {
    setDay(d);
    void loadSlots(d.dateStr);
  }

  return (
    <div className="panel">
      <p className="section-label">Pick a new date &middot; {tzLabel.toLowerCase()} time</p>
      {checkingDays && availableDates === null ? (
        <p className="loading">Checking open days&hellip;</p>
      ) : (
        <div className="day-rail">
          {days.map((d) => {
            const noSlots = availableDates !== null && d.isOpen && !availableDates.has(d.dateStr);
            return (
              <button
                key={d.dateStr}
                type="button"
                className={`day-chip ${d.isToday ? "today" : ""} ${day?.dateStr === d.dateStr ? "selected" : ""}`}
                disabled={!d.isOpen || noSlots}
                title={!d.isOpen ? "Closed" : noSlots ? "No open times" : undefined}
                onClick={() => chooseDay(d)}
              >
                <span className="dow">{d.isToday ? "Today" : d.weekdayShort}</span>
                <span className="dnum">{d.dayNum}</span>
                <span className="mon">{d.monthShort}</span>
              </button>
            );
          })}
        </div>
      )}

      {day && (
        <div style={{ marginTop: "1.4rem" }}>
          <p className="section-label">Open times &middot; {serviceName}</p>
          <div aria-live="polite" aria-busy={loading}>
            {loading ? (
              <p className="loading">Loading times&hellip;</p>
            ) : slotError ? (
              <div className="empty">{slotError}</div>
            ) : slots && slots.length === 0 ? (
              <div className="empty">
                No open times on this date.
                <span className="mono">Try another day</span>
              </div>
            ) : (
              <div className="slot-grid">
                {slots?.map((s) => (
                  <button
                    key={s.startIso}
                    type="button"
                    className={`slot ${slot?.startIso === s.startIso ? "selected" : ""}`}
                    onClick={() => setSlot(s)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {slot && day && (
        <form action={action} className="actions" style={{ marginTop: "1.4rem" }}>
          <input type="hidden" name="id" value={bookingId} />
          <input type="hidden" name="date" value={day.dateStr} />
          <input type="hidden" name="startIso" value={slot.startIso} />
          <button type="submit" className="btn block" disabled={pending}>
            {pending ? "Moving your booking…" : `Move to ${slot.label}`}
            <span className="arr" aria-hidden="true">&rarr;</span>
          </button>
        </form>
      )}

      {state.error && <p className="field-error" role="alert" style={{ marginTop: "1rem" }}>{state.error}</p>}
    </div>
  );
}
