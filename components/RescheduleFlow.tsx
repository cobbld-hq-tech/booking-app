"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import type { AvailableSlot } from "@/lib/db";
import type { DayOption } from "@/lib/time";
import { rescheduleAction, type ManageState } from "@/app/manage/[id]/actions";
import { Calendar } from "./Calendar";
import { TimeSlots } from "./TimeSlots";

interface Props {
  bookingId: string;
  serviceId: number;
  days: DayOption[];
}

const initial: ManageState = {};

export function RescheduleFlow({ bookingId, serviceId, days }: Props) {
  const [day, setDay] = useState<DayOption | null>(null);
  const [slots, setSlots] = useState<AvailableSlot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [slot, setSlot] = useState<AvailableSlot | null>(null);
  const [state, action, pending] = useActionState(rescheduleAction, initial);
  const [availableDates, setAvailableDates] = useState<Set<string> | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch(`/api/availability/days?serviceId=${serviceId}`);
        const data = await res.json();
        if (active && res.ok) setAvailableDates(new Set<string>(data.availableDates ?? []));
      } catch {
        // leave null = unrestricted (fall back to open/closed only)
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
    <div>
      <div className="datetime-row">
        <Calendar
          days={days}
          availableDates={availableDates}
          selected={day?.dateStr ?? null}
          onSelect={chooseDay}
        />
        <TimeSlots
          daySelected={!!day}
          dayLabel={day ? `${day.weekdayShort}, ${day.monthShort} ${day.dayNum}` : undefined}
          loading={loading}
          error={slotError}
          slots={slots}
          selectedIso={slot?.startIso ?? null}
          onSelect={setSlot}
        />
      </div>

      {slot && day && (
        <form action={action} style={{ marginTop: 24, maxWidth: 392 }}>
          <input type="hidden" name="id" value={bookingId} />
          <input type="hidden" name="date" value={day.dateStr} />
          <input type="hidden" name="startIso" value={slot.startIso} />
          <button type="submit" className="btn block" disabled={pending}>
            {pending ? "Moving your booking…" : `Move to ${slot.label}`}
            <span className="arr" aria-hidden="true">&rarr;</span>
          </button>
        </form>
      )}

      {state.error && (
        <p className="field-error" role="alert" style={{ marginTop: 16 }}>{state.error}</p>
      )}
    </div>
  );
}
