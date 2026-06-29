import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { env } from "./env";

// Lazily construct Better Auth, mirroring the lazy Neon client in lib/db.ts.
// Importing this module is side-effect-free and never reads a throwing `required`
// env getter at module scope, so `next build` and cold starts stay safe even when
// DATABASE_URL / BETTER_AUTH_SECRET are absent from the build environment. The
// instance type is inferred from this factory (annotating it widens to
// Auth<BetterAuthOptions>, which the concrete options type will not satisfy).
function createAuth() {
  // Better Auth opens transactions through a pool, so it uses the Neon serverless
  // WebSocket Pool (not the one-shot HTTP client the app uses for its queries).
  // Node < 21 has no global WebSocket, so wire one up; harmless on newer runtimes.
  neonConfig.webSocketConstructor = ws;

  return betterAuth({
    database: new Pool({ connectionString: env.databaseUrl }),
    secret: env.betterAuthSecret,
    baseURL: env.betterAuthUrl,
    emailAndPassword: { enabled: true },
    // Lock account creation to the single owner email. The owner is seeded at
    // server startup (instrumentation.ts) so the account already exists before any
    // request can reach the sign-up endpoint — a stranger cannot pre-register it.
    // This hook then rejects every other sign-up, closing the open-endpoint hole.
    databaseHooks: {
      user: {
        create: {
          before: async (user: { email: string }) => {
            if (user.email.toLowerCase() !== env.adminEmail.toLowerCase()) {
              throw new Error("Sign-up is closed.");
            }
            return { data: user };
          },
        },
      },
    },
    // Required for cookies to be set from within Server Actions / route handlers.
    plugins: [nextCookies()],
  });
}

let _auth: ReturnType<typeof createAuth> | null = null;

export function getAuth(): ReturnType<typeof createAuth> {
  if (!_auth) _auth = createAuth();
  return _auth;
}

/**
 * Idempotently ensure the single owner account exists with the env credentials.
 * Called once at server startup (instrumentation.ts) and again as a backstop on
 * the owner's first login. If the account already exists, signUpEmail throws and
 * we swallow it.
 */
export async function ensureAdminSeeded(): Promise<void> {
  try {
    await getAuth().api.signUpEmail({
      body: {
        name: "Shop Owner",
        email: env.adminEmail,
        password: env.adminPassword,
      },
    });
  } catch {
    // Already exists (the common case after first boot) — nothing to do.
  }
}

/** True when a session belongs to the one authorised owner account. Compared
 *  case-insensitively because Better Auth stores emails lowercased. */
export function isAdminSession(
  session: { user?: { email?: string | null } } | null,
): boolean {
  const email = session?.user?.email;
  return Boolean(email && email.toLowerCase() === env.adminEmail.toLowerCase());
}
