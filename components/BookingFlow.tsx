"use client";

import { useCallback, useState } from "react";
// Type-only imports: erased at compile time, so the Neon/server code in lib/db
// never reaches the client bundle. The formatters from lib/time are pure Intl
// and safe to run in the browser.
import type { Service, AvailableSlot, BookingConfirmation } from "@/lib/db";
import type { DayOption } from "@/lib/time";
import { formatLongDate, formatTime } from "@/lib/time";

type Step = "service" | "date" | "time" | "details";
const STEP_ORDER: Step[] = ["service", "date", "time", "details"];
const STEP_LABELS: Record<Step, string> = {
  service: "Service",
  date: "Date",
  time: "Time",
  details: "Details",
};

interface Props {
  services: Service[];
  days: DayOption[];
  shopName: string;
  tzLabel: string;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

function formatPhone(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function BookingFlow({ services, days, shopName, tzLabel }: Props) {
  const [step, setStep] = useState<Step>("service");
  const [service, setService] = useState<Service | null>(null);
  const [day, setDay] = useState<DayOption | null>(null);
  const [slots, setSlots] = useState<AvailableSlot[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [slot, setSlot] = useState<AvailableSlot | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);
  // Which upcoming dates actually have an open slot for the chosen service. null
  // means "not checked yet" (fall back to open/closed only).
  const [availableDates, setAvailableDates] = useState<Set<string> | null>(null);
  const [checkingDays, setCheckingDays] = useState(false);

  const loadSlots = useCallback(async (serviceId: number, dateStr: string) => {
    setLoadingSlots(true);
    setSlotError(null);
    setSlots(null);
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
      setSlotError("Could not load times. Check your connection and try again.");
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  const loadDays = useCallback(async (serviceId: number) => {
    setCheckingDays(true);
    setAvailableDates(null);
    try {
      const res = await fetch(`/api/availability/days?serviceId=${serviceId}`);
      const data = await res.json();
      if (res.ok) setAvailableDates(new Set<string>(data.availableDates ?? []));
    } catch {
      // Leave availableDates null: couldn't check, fall back to open/closed only.
    } finally {
      setCheckingDays(false);
    }
  }, []);

  function chooseService(s: Service) {
    setService(s);
    setSlot(null);
    setDay(null);
    setConflict(false);
    setStep("date");
    void loadDays(s.id);
  }

  function chooseDay(d: DayOption) {
    if (!service) return;
    setDay(d);
    setSlot(null);
    setConflict(false);
    setStep("time");
    void loadSlots(service.id, d.dateStr);
  }

  function chooseSlot(s: AvailableSlot) {
    setSlot(s);
    setConflict(false);
    setSubmitError(null);
    setErrors({});
    setStep("details");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!service || !day || !slot) return;

    const nextErrors: { name?: string; phone?: string } = {};
    if (!form.name.trim()) nextErrors.name = "Please enter your name.";
    if (form.phone.replace(/\D/g, "").length < 10) {
      nextErrors.phone = "Enter a 10-digit phone number.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: service.id,
          date: day.dateStr,
          startIso: slot.startIso,
          name: form.name,
          phone: form.phone,
          email: form.email,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setConfirmation(data.booking);
      } else if (data.reason === "conflict") {
        // The proof moment, from the loser's side: the slot was claimed between
        // page load and submit. Drop back to the time step with fresh times and a
        // clear, non-alarming explanation.
        setConflict(true);
        setSlots(data.slots ?? []);
        setSlot(null);
        setStep("time");
      } else {
        setSubmitError(data.message ?? "Could not complete the booking. Please try again.");
      }
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setStep("service");
    setService(null);
    setDay(null);
    setSlots(null);
    setSlot(null);
    setForm({ name: "", phone: "", email: "" });
    setErrors({});
    setConflict(false);
    setSubmitError(null);
    setConfirmation(null);
  }

  // ── Confirmation screen ────────────────────────────────────────────────────
  if (confirmation) {
    const start = new Date(confirmation.startIso);
    const end = new Date(confirmation.endIso);
    return (
      <div className="confirm-card" role="status" aria-live="polite">
        <div className="confirm-head">
          <div className="check" aria-hidden="true">✓</div>
          <h2>You&rsquo;re booked.</h2>
          <p>See you at {shopName}. We&rsquo;ll have the bay ready.</p>
        </div>
        <div className="confirm-body">
          <div className="confirm-row">
            <span className="k">Service</span>
            <span className="v">{confirmation.serviceName}</span>
          </div>
          <div className="confirm-row">
            <span className="k">Date</span>
            <span className="v">{formatLongDate(start)}</span>
          </div>
          <div className="confirm-row">
            <span className="k">Time</span>
            <span className="v mono-time">
              {formatTime(start)} &ndash; {formatTime(end)} {tzLabel}
            </span>
          </div>
          <div className="confirm-row">
            <span className="k">Name</span>
            <span className="v">{confirmation.customerName}</span>
          </div>
          <div className="confirm-row">
            <span className="k">Ref</span>
            <span className="v mono-time">{confirmation.id.slice(0, 8).toUpperCase()}</span>
          </div>
          <div className="actions">
            <a className="btn" href={`/manage/${confirmation.id}`}>
              Manage booking <span className="arr" aria-hidden="true">&rarr;</span>
            </a>
            <button type="button" className="btn ghost" onClick={reset}>
              Book another
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentIndex = STEP_ORDER.indexOf(step);

  return (
    <div className="panel">
      {/* stepper */}
      <div className="steps" aria-label="Booking progress">
        {STEP_ORDER.map((s, i) => (
          <span
            key={s}
            className={`step ${i === currentIndex ? "active" : ""} ${i < currentIndex ? "done" : ""}`}
            aria-current={i === currentIndex ? "step" : undefined}
          >
            <span className="n">{i < currentIndex ? "✓" : i + 1}</span>
            {STEP_LABELS[s]}
          </span>
        ))}
      </div>

      {/* ── Step: service ── */}
      {step === "service" && (
        <div>
          <p className="section-label">Choose a service</p>
          <div className="choice-grid">
            {services.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`service-card ${service?.id === s.id ? "selected" : ""}`}
                onClick={() => chooseService(s)}
              >
                <span className="svc-name">{s.name}</span>
                <span className="svc-dur">{formatDuration(s.durationMinutes)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Step: date ── */}
      {step === "date" && service && (
        <div>
          <button type="button" className="step-back" onClick={() => setStep("service")}>
            &larr; {service.name}
          </button>
          <p className="section-label">Pick a date &middot; {tzLabel.toLowerCase()} time</p>
          {checkingDays && availableDates === null ? (
            <p className="loading">Checking open days&hellip;</p>
          ) : (
            <div className="day-rail">
              {days.map((d) => {
                const noSlots = availableDates !== null && d.isOpen && !availableDates.has(d.dateStr);
                const disabled = !d.isOpen || noSlots;
                return (
                  <button
                    key={d.dateStr}
                    type="button"
                    className={`day-chip ${d.isToday ? "today" : ""} ${day?.dateStr === d.dateStr ? "selected" : ""}`}
                    disabled={disabled}
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
        </div>
      )}

      {/* ── Step: time ── */}
      {step === "time" && service && day && (
        <div>
          <button type="button" className="step-back" onClick={() => setStep("date")}>
            &larr; {day.weekdayShort}, {day.monthShort} {day.dayNum}
          </button>

          {conflict && (
            <div className="conflict" role="alert">
              <span className="dot" aria-hidden="true" />
              <div>
                <b>That time was just booked.</b>
                <p>Someone grabbed it a moment before you. Here are the times still open. Pick another.</p>
              </div>
            </div>
          )}

          <p className="section-label">Open start times &middot; {formatDuration(service.durationMinutes)}</p>

          <div aria-live="polite" aria-busy={loadingSlots}>
            {loadingSlots ? (
              <p className="loading">Loading times&hellip;</p>
            ) : slotError ? (
              <div className="empty">{slotError}</div>
            ) : slots && slots.length === 0 ? (
              <div className="empty">
                No open times left on this date.
                <span className="mono">Try another day</span>
              </div>
            ) : (
              <div className="slot-grid">
                {slots?.map((s) => (
                  <button
                    key={s.startIso}
                    type="button"
                    className={`slot ${slot?.startIso === s.startIso ? "selected" : ""}`}
                    onClick={() => chooseSlot(s)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Step: details ── */}
      {step === "details" && service && day && slot && (
        <div>
          <button type="button" className="step-back" onClick={() => setStep("time")}>
            &larr; Times
          </button>

          <div className="chosen-summary">
            <span><b>{service.name}</b> &middot; {formatDuration(service.durationMinutes)}</span>
            <span>{formatLongDate(new Date(slot.startIso))}</span>
            <span><b>{slot.label}</b> {tzLabel}</span>
          </div>

          <form onSubmit={submit} noValidate>
            <div className={`field ${errors.name ? "invalid" : ""}`}>
              <label htmlFor="name">Name</label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              {errors.name && <span className="field-error">{errors.name}</span>}
            </div>

            <div className={`field ${errors.phone ? "invalid" : ""}`}>
              <label htmlFor="phone">Phone</label>
              <input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="(432) 555-0142"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })}
              />
              {errors.phone && <span className="field-error">{errors.phone}</span>}
            </div>

            <div className="field">
              <label htmlFor="email">
                Email <span className="opt">(optional)</span>
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            {submitError && <p className="field-error" role="alert">{submitError}</p>}

            <div className="actions">
              <button type="submit" className="btn block" disabled={submitting}>
                {submitting ? "Booking…" : "Confirm booking"}
                <span className="arr" aria-hidden="true">&rarr;</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
