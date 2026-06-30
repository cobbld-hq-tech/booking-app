"use client";

import { useCallback, useRef, useState } from "react";
// Type-only imports: erased at compile time, so the Neon/server code in lib/db
// never reaches the client bundle. The formatters from lib/time are pure Intl
// and safe to run in the browser.
import type { Service, AvailableSlot, BookingConfirmation } from "@/lib/db";
import type { DayOption } from "@/lib/time";
import { formatLongDate, formatTime } from "@/lib/time";
import { Calendar } from "./Calendar";
import { TimeSlots } from "./TimeSlots";

type Step = "service" | "datetime" | "details";
const STEPS: { key: Step; label: string }[] = [
  { key: "service", label: "Service" },
  { key: "datetime", label: "Date & time" },
  { key: "details", label: "Your details" },
];

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

/**
 * One-line description + short label per service, keyed off the service name so
 * the data layer (which has no description column) stays untouched. Falls back to
 * no description and the full name if a service doesn't match.
 */
function serviceMeta(name: string): { desc: string; short: string } {
  const n = name.toLowerCase();
  if (n.includes("oil")) return { desc: "Synthetic or conventional, plus a 20-point look-over.", short: "Oil change" };
  if (n.includes("brake")) return { desc: "Pads, rotors, the works. Priced per axle.", short: "Brakes" };
  if (n.includes("diagnostic") || n.includes("check-engine") || n.includes("check engine"))
    return { desc: "We pull the codes and tell you what is actually going on.", short: "Diagnostic" };
  if (n.includes("inspection") || n.includes("safety")) return { desc: "Quick, official, in and out.", short: "Inspection" };
  return { desc: "", short: name };
}

function dayLabel(d: DayOption): string {
  return `${d.weekdayShort}, ${d.monthShort} ${d.dayNum}`;
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
  // Monotonic request tokens: a slow response can't overwrite a newer selection.
  const slotsReq = useRef(0);
  const daysReq = useRef(0);

  const loadSlots = useCallback(async (serviceId: number, dateStr: string) => {
    const reqId = ++slotsReq.current;
    setLoadingSlots(true);
    setSlotError(null);
    setSlots(null);
    try {
      const res = await fetch(`/api/availability?serviceId=${serviceId}&date=${dateStr}`);
      const data = await res.json();
      if (reqId !== slotsReq.current) return; // superseded by a newer day/service
      if (!res.ok) {
        setSlotError(data.error ?? "Could not load times.");
        setSlots([]);
      } else {
        setSlots(data.slots ?? []);
      }
    } catch {
      if (reqId !== slotsReq.current) return;
      setSlotError("Could not load times. Check your connection and try again.");
      setSlots([]);
    } finally {
      if (reqId === slotsReq.current) setLoadingSlots(false);
    }
  }, []);

  const loadDays = useCallback(async (serviceId: number) => {
    const reqId = ++daysReq.current;
    setAvailableDates(null);
    try {
      const res = await fetch(`/api/availability/days?serviceId=${serviceId}`);
      const data = await res.json();
      if (reqId !== daysReq.current) return; // superseded by a newer service pick
      if (res.ok) setAvailableDates(new Set<string>(data.availableDates ?? []));
    } catch {
      // Leave availableDates null: couldn't check, fall back to open/closed only.
    }
  }, []);

  function chooseService(s: Service) {
    setService(s);
    setSlot(null);
    setDay(null);
    setConflict(false);
    setStep("datetime");
    void loadDays(s.id);
  }

  function chooseDay(d: DayOption) {
    if (!service) return;
    setDay(d);
    setSlot(null);
    setConflict(false);
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
        // page load and submit. Drop back to the date & time step with fresh times
        // and a clear, non-alarming explanation.
        setConflict(true);
        setSlots(data.slots ?? []);
        setSlot(null);
        setStep("datetime");
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
      <div className="confirm-wrap" role="status" aria-live="polite">
        <div className="confirm-card">
          <div className="confirm-head">
            <div className="check" aria-hidden="true">&#10003;</div>
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
      </div>
    );
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const canReach = (i: number): boolean => {
    if (i === 0) return true;
    if (i === 1) return !!service;
    return !!service && !!day && !!slot;
  };

  return (
    <div className="book-layout">
      {/* aside: progress + running summary */}
      <aside className="book-aside">
        <nav className="psteps" aria-label="Booking progress">
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              className={`pstep ${i === stepIndex ? "active" : ""} ${i < stepIndex ? "done" : ""}`}
              aria-current={i === stepIndex ? "step" : undefined}
              disabled={!canReach(i)}
              onClick={() => canReach(i) && setStep(s.key)}
            >
              <span className="pstep-dot">{i < stepIndex ? "✓" : i + 1}</span>
              <span className="pstep-label">{s.label}</span>
            </button>
          ))}
        </nav>

        <div className="summary">
          <span className="summary-label">Your booking</span>
          {!service ? (
            <span className="summary-empty">Pick a service to get started.</span>
          ) : (
            <>
              <div className="summary-svc">
                <span className="summary-svc-name">{service.name}</span>
                <span className="summary-svc-dur">{formatDuration(service.durationMinutes)}</span>
              </div>
              {day && (
                <div className="summary-row">
                  <span className="k">Date</span>
                  <span className="v">{dayLabel(day)}</span>
                </div>
              )}
              {slot && (
                <div className="summary-row">
                  <span className="k">Time</span>
                  <span className="v mono-time">{slot.label} {tzLabel}</span>
                </div>
              )}
            </>
          )}
          <div className="summary-note">
            <span className="dot" aria-hidden="true" />
            <span>Your slot is held the instant you confirm. No double-bookings.</span>
          </div>
        </div>
      </aside>

      {/* main: the active step */}
      <main className="book-main">
        {/* ── Step: service ── */}
        {step === "service" && (
          <div>
            <p className="book-eyebrow">Step 1 &middot; Service</p>
            <h2 className="book-h2">What can we do for you?</h2>
            <div className="choice-grid">
              {services.map((s) => {
                const meta = serviceMeta(s.name);
                const isSel = service?.id === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`service-card ${isSel ? "selected" : ""}`}
                    onClick={() => chooseService(s)}
                  >
                    {isSel && <span className="svc-check" aria-hidden="true">&#10003;</span>}
                    <span className="svc-name">{s.name}</span>
                    {meta.desc && <span className="svc-desc">{meta.desc}</span>}
                    <span className="svc-dur">{formatDuration(s.durationMinutes)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Step: date & time ── */}
        {step === "datetime" && service && (
          <div>
            <button type="button" className="step-back" onClick={() => setStep("service")}>
              &larr; {serviceMeta(service.name).short}
            </button>
            <p className="book-eyebrow">Step 2 &middot; Date &amp; time</p>
            <h2 className="book-h2">When works for you?</h2>
            <p className="book-sub">Central time. We&rsquo;re open Mon&ndash;Fri 7:30&ndash;6, Sat 8&ndash;2.</p>

            {conflict && (
              <div className="conflict" role="alert">
                <span className="dot" aria-hidden="true" />
                <div>
                  <b>That time was just booked.</b>
                  <p>Someone grabbed it a moment before you. Here are the times still open. Pick another.</p>
                </div>
              </div>
            )}

            <div className="datetime-row">
              <Calendar
                days={days}
                availableDates={availableDates}
                selected={day?.dateStr ?? null}
                onSelect={chooseDay}
              />
              <TimeSlots
                daySelected={!!day}
                dayLabel={day ? dayLabel(day) : undefined}
                loading={loadingSlots}
                error={slotError}
                slots={slots}
                selectedIso={slot?.startIso ?? null}
                onSelect={chooseSlot}
              />
            </div>
          </div>
        )}

        {/* ── Step: details ── */}
        {step === "details" && service && day && slot && (
          <div>
            <button type="button" className="step-back" onClick={() => setStep("datetime")}>
              &larr; Times
            </button>
            <p className="book-eyebrow">Step 3 &middot; Your details</p>
            <h2 className="book-h2">Last step. Who&rsquo;s coming in?</h2>

            <form onSubmit={submit} noValidate style={{ maxWidth: 440 }}>
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

            <p className="book-footnote">
              {service.name} &middot; {formatLongDate(new Date(slot.startIso))} &middot; {slot.label} {tzLabel}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
