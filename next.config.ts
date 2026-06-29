import type { NextConfig } from "next";

// Minimal config. We deliberately do NOT use withSentryConfig: this project
// reports errors with a manual Sentry.captureException helper (see lib/sentry.ts),
// so the only Sentry config needed is the SENTRY_DSN env var — no build-time
// wizard, no source-map upload. trailingSlash is left at its default (false) so
// /api/* routes are never 308-redirected, which keeps POST bodies intact.
const nextConfig: NextConfig = {};

export default nextConfig;
