"use client";

import { useActionState } from "react";
import { loginAdmin, type ActionState } from "../actions";

const initial: ActionState = {};

export default function AdminLoginPage() {
  const [state, action, pending] = useActionState(loginAdmin, initial);

  return (
    <div className="admin-auth">
      <div className="admin-login-card">
        <p className="section-label">Owner sign in</p>
        <h1 className="admin-login-title">Permian Auto Works</h1>
        <form action={action}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="username" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {state.error && (
            <p className="field-error" role="alert">{state.error}</p>
          )}
          <div className="actions">
            <button type="submit" className="btn block" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
              <span className="arr" aria-hidden="true">&rarr;</span>
            </button>
          </div>
        </form>
        <p className="admin-login-help">Owner access only.</p>
        <a className="admin-back-link mono" href="/">&larr; Back to booking</a>
      </div>
    </div>
  );
}
