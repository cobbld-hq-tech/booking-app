import { Resend } from "resend";
import { env } from "./env";

// Email via Resend. Lazily created so importing this module never requires a key.
// Without RESEND_API_KEY the send is skipped (logged), so the app runs cleanly
// before email is wired — turning it on is just adding the key.
let _resend: Resend | null = null;

function client(): Resend | null {
  if (!env.resendApiKey) return null;
  if (!_resend) _resend = new Resend(env.resendApiKey);
  return _resend;
}

export async function sendEmail(
  to: string,
  subject: string,
  text: string,
): Promise<{ sent: boolean }> {
  const c = client();
  if (!c) {
    console.log(`[email skipped: no RESEND_API_KEY] to=${to} subject=${JSON.stringify(subject)}`);
    return { sent: false };
  }
  const { error } = await c.emails.send({ from: env.resendFrom, to, subject, text });
  if (error) throw new Error(`Resend send failed: ${error.message}`);
  return { sent: true };
}
