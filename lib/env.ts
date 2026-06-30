// Centralised, validated access to configuration. All getters are lazy so that
// importing this module (e.g. during `next build`, which loads route modules to
// read their `runtime`/`dynamic` exports) never throws for missing env vars.
// Validation happens at request time, where a throw is caught and reported.

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : fallback;
}

function positiveIntWithDefault(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw || raw.trim() === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer (got: ${JSON.stringify(raw)})`);
  }
  return n;
}

export const env = {
  // Required. Neon pooled Postgres connection string (host contains `-pooler`,
  // `sslmode=require`). Used by the @neondatabase/serverless HTTP driver in
  // lib/db.ts and by Better Auth's Pool in lib/auth.ts.
  get databaseUrl(): string {
    return required("DATABASE_URL");
  },

  // ── Admin auth (Better Auth) — consumed in Phase 3 (lib/auth.ts). ──────────
  // A long random string used to sign Better Auth sessions/cookies.
  get betterAuthSecret(): string {
    return required("BETTER_AUTH_SECRET");
  },
  // The app's own public origin, e.g. https://permian-auto.vercel.app. Better
  // Auth uses this to build cookie/callback URLs. Falls back to localhost in dev.
  get betterAuthUrl(): string {
    return process.env.BETTER_AUTH_URL || "http://localhost:3000";
  },
  // The single owner/admin account, seeded once on first run (see lib/auth.ts).
  get adminEmail(): string {
    return required("ADMIN_EMAIL");
  },
  get adminPassword(): string {
    return required("ADMIN_PASSWORD");
  },

  // ── Notifications (Phase 5+, all optional) ─────────────────────────────────
  // Email via Resend. Without a key, email sends are skipped (logged, no-op).
  get resendApiKey(): string | undefined {
    return process.env.RESEND_API_KEY || undefined;
  },
  // From header for emails. Use a Resend-verified domain in production; the
  // onboarding sender only delivers to the Resend account owner.
  get resendFrom(): string {
    return optional("RESEND_FROM", "Permian Auto Works <onboarding@resend.dev>");
  },
  // SMS via Twilio (same account as the missed-call tool). Without these three,
  // SMS sends are skipped (logged, no-op) — wiring them on is just adding the keys.
  get twilioAccountSid(): string | undefined {
    return process.env.TWILIO_ACCOUNT_SID || undefined;
  },
  get twilioAuthToken(): string | undefined {
    return process.env.TWILIO_AUTH_TOKEN || undefined;
  },
  get twilioNumber(): string | undefined {
    return process.env.TWILIO_NUMBER || undefined;
  },
  // How many hours before the appointment the day-ahead reminder fires. Default 24.
  get reminderLeadHours(): number {
    return positiveIntWithDefault("REMINDER_LEAD_HOURS", 24);
  },
  // The same-day "see you soon" nudge, hours before the appointment. Default 2.
  // Should be less than REMINDER_LEAD_HOURS; if it is not, the nudge is skipped.
  get secondReminderLeadHours(): number {
    return positiveIntWithDefault("SECOND_REMINDER_LEAD_HOURS", 2);
  },

  // Optional, may be undefined.
  get sentryDsn(): string | undefined {
    return process.env.SENTRY_DSN || undefined;
  },
  get publicBaseUrl(): string | undefined {
    return process.env.PUBLIC_BASE_URL || undefined;
  },
};
