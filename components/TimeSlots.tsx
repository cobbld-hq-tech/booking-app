import type { AvailableSlot } from "@/lib/db";

interface Props {
  /** Whether a day has been chosen yet (controls the empty prompt). */
  daySelected: boolean;
  /** Label for the chosen day, e.g. "Mon, Jun 30". */
  dayLabel?: string;
  loading: boolean;
  error: string | null;
  slots: AvailableSlot[] | null;
  selectedIso: string | null;
  onSelect: (slot: AvailableSlot) => void;
}

function ClockGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function Group({ label, slots, selectedIso, onSelect }: {
  label: string;
  slots: AvailableSlot[];
  selectedIso: string | null;
  onSelect: (slot: AvailableSlot) => void;
}) {
  if (slots.length === 0) return null;
  return (
    <div className="slot-group">
      <p className="slot-group-label">{label}</p>
      <div className="slot-grid">
        {slots.map((s) => (
          <button
            key={s.startIso}
            type="button"
            className={`slot ${selectedIso === s.startIso ? "selected" : ""}`}
            aria-pressed={selectedIso === s.startIso}
            onClick={() => onSelect(s)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The open start times for the chosen day, grouped into Morning / Afternoon. Shows
 * an empty prompt before a day is picked, and loading / error / no-times states.
 * The API only returns genuinely open slots, so there are no "taken" chips here —
 * a slot claimed mid-flow simply drops out and the conflict banner explains why.
 */
export function TimeSlots({ daySelected, dayLabel, loading, error, slots, selectedIso, onSelect }: Props) {
  if (!daySelected) {
    return (
      <div className="slot-area">
        <div className="slot-empty">
          <ClockGlyph />
          <span>Pick a day to see the open times.</span>
        </div>
      </div>
    );
  }

  const morning = slots?.filter((s) => /\bAM$/.test(s.label)) ?? [];
  const afternoon = slots?.filter((s) => /\bPM$/.test(s.label)) ?? [];

  return (
    <div className="slot-area" aria-live="polite" aria-busy={loading}>
      {dayLabel && <p className="slot-day-label">{dayLabel}</p>}
      {loading ? (
        <p className="loading">Loading times&hellip;</p>
      ) : error ? (
        <div className="empty">{error}</div>
      ) : slots && slots.length === 0 ? (
        <div className="empty">
          No open times left on this date.
          <span className="mono">Try another day</span>
        </div>
      ) : (
        <>
          <Group label="Morning" slots={morning} selectedIso={selectedIso} onSelect={onSelect} />
          <Group label="Afternoon" slots={afternoon} selectedIso={selectedIso} onSelect={onSelect} />
        </>
      )}
    </div>
  );
}
