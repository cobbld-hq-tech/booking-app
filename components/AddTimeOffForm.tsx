"use client";

import { useActionState } from "react";
import { addTimeOffAction, type ActionState } from "@/app/admin/actions";

const initial: ActionState = {};

export function AddTimeOffForm() {
  const [state, action, pending] = useActionState(addTimeOffAction, initial);

  return (
    <form action={action} className="timeoff-form">
      <div className="field">
        <label htmlFor="to-date">Date</label>
        <input id="to-date" name="date" type="date" required />
      </div>
      <div className="to-times">
        <div className="field">
          <label htmlFor="to-start">From</label>
          <input id="to-start" name="start" type="time" defaultValue="12:00" required />
        </div>
        <div className="field">
          <label htmlFor="to-end">To</label>
          <input id="to-end" name="end" type="time" defaultValue="13:00" required />
        </div>
      </div>
      <div className="field">
        <label htmlFor="to-reason">Reason <span className="opt">(optional)</span></label>
        <input id="to-reason" name="reason" type="text" placeholder="Lunch, parts run, closed" />
      </div>
      {state.error && <p className="field-error" role="alert">{state.error}</p>}
      {state.ok && <p className="field-ok mono" role="status">Time off added.</p>}
      <button type="submit" className="btn tang block" disabled={pending}>
        {pending ? "Adding…" : "Block this time"}
      </button>
    </form>
  );
}
