import * as Sentry from "@sentry/nextjs";

// Next.js calls register() once at server startup. We initialise Sentry only for
// the Node.js runtime (where the route handlers run). If SENTRY_DSN is unset,
// Sentry is disabled and every capture call becomes a no-op — no other config,
// no source-map upload, no build-time wizard required.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      enabled: Boolean(process.env.SENTRY_DSN),
      tracesSampleRate: 0,
    });

    // Seed the single owner account at startup, before any request can reach the
    // sign-up endpoint. Combined with the email-locked sign-up hook in lib/auth.ts,
    // this closes the window where a stranger could pre-register ADMIN_EMAIL.
    // Imported dynamically so the auth/Neon-pool code only loads at runtime.
    try {
      const { ensureAdminSeeded } = await import("./lib/auth");
      await ensureAdminSeeded();
    } catch {
      // Best-effort: a transient DB hiccup at boot must not crash startup. The
      // owner's first login re-runs the seed as a backstop.
    }
  }
}

// Captures errors that propagate out of route handlers / RSC rendering. Our
// handlers catch their own errors (so they can return a clean JSON response),
// so this is a backstop — the primary path is the manual reportError helper.
export const onRequestError = Sentry.captureRequestError;
