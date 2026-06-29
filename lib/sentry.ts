import * as Sentry from "@sentry/nextjs";

/**
 * Report an error to Sentry and flush before returning.
 *
 * Vercel freezes the function the moment the HTTP response is returned, which can
 * drop in-flight Sentry events. `await Sentry.flush()` ensures the event is sent
 * first. If SENTRY_DSN is unset, Sentry is disabled and this is effectively a
 * no-op (flush resolves immediately).
 *
 * IMPORTANT: only *unexpected* failures should reach this helper. The expected
 * double-booking conflict (Postgres exclusion violation, SQLSTATE 23P01) is
 * normal flow, not an error — it is handled and returned to the caller WITHOUT
 * being reported here. See lib/db.ts (createBooking) and the bookings route.
 */
export async function reportError(
  error: unknown,
  context?: { route?: string; extra?: Record<string, unknown> },
): Promise<void> {
  Sentry.captureException(error, {
    tags: context?.route ? { route: context.route } : undefined,
    extra: context?.extra,
  });
  await Sentry.flush(2000);
}
