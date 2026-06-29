"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAuth, ensureAdminSeeded, isAdminSession } from "@/lib/auth";
import { cancelBooking, addTimeOff } from "@/lib/db";
import { parseDateString, zonedWallTimeToUtc } from "@/lib/time";
import { reportError } from "@/lib/sentry";
import { env } from "@/lib/env";

export interface ActionState {
  error?: string;
  ok?: boolean;
}

/** Redirects to the login page unless the caller is the authorised owner. */
async function requireAdmin(): Promise<void> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!isAdminSession(session)) redirect("/admin/login");
}

/**
 * Log the owner in. Only the configured ADMIN_EMAIL is accepted; on first use the
 * account is seeded from env so there is no separate setup step. The password is
 * verified by Better Auth (signInEmail), so a wrong password is rejected even
 * though the account is auto-created. The session cookie is set by the nextCookies
 * plugin. Used with useActionState, hence the (prevState, formData) signature.
 */
export async function loginAdmin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Enter your email and password." };
  if (email.toLowerCase() !== env.adminEmail.toLowerCase()) {
    return { error: "Invalid credentials." };
  }

  await ensureAdminSeeded();

  try {
    await getAuth().api.signInEmail({
      body: { email: env.adminEmail, password },
      headers: await headers(),
    });
  } catch {
    return { error: "Invalid credentials." };
  }
  // redirect() throws NEXT_REDIRECT and must live outside the try/catch above.
  redirect("/admin");
}

/** Sign the owner out and return to the login page. */
export async function logoutAdmin(): Promise<void> {
  try {
    await getAuth().api.signOut({ headers: await headers() });
  } catch {
    // already signed out — fall through to the redirect.
  }
  redirect("/admin/login");
}

/** Cancel a booking. Sets status='cancelled', which reopens its slot via the
 *  partial exclusion constraint. Plain <form action> — receives FormData only. */
export async function cancelBookingAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (id) {
    try {
      await cancelBooking(id);
    } catch (error) {
      await reportError(error, { route: "admin/cancel" });
    }
  }
  revalidatePath("/admin");
}

/** Add a time-off block. Date + start/end are entered in shop-local (Central)
 *  time and converted to UTC instants for storage. */
export async function addTimeOffAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();

  const date = String(formData.get("date") ?? "");
  const start = String(formData.get("start") ?? "");
  const end = String(formData.get("end") ?? "");
  const reason = String(formData.get("reason") ?? "");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
    return { error: "Pick a date and a start and end time." };
  }

  try {
    const { year, month, day } = parseDateString(date);
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const startUtc = zonedWallTimeToUtc(year, month, day, sh, sm);
    const endUtc = zonedWallTimeToUtc(year, month, day, eh, em);

    const result = await addTimeOff({
      startsAtIso: startUtc.toISOString(),
      endsAtIso: endUtc.toISOString(),
      reason,
    });
    if (!result.ok) return { error: result.message ?? "Could not add time off." };
  } catch (error) {
    await reportError(error, { route: "admin/time-off" });
    return { error: "Could not add time off. Please try again." };
  }

  revalidatePath("/admin");
  return { ok: true };
}
