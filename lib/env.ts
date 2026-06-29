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

  // Optional, may be undefined.
  get sentryDsn(): string | undefined {
    return process.env.SENTRY_DSN || undefined;
  },
  get publicBaseUrl(): string | undefined {
    return process.env.PUBLIC_BASE_URL || undefined;
  },
};
