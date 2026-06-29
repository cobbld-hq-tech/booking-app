import { env } from "./env";

/**
 * Normalise a phone to E.164, which Twilio requires for the `To` parameter
 * (it rejects display formats like "(432) 555-0142" with error 21211). The
 * booking form captures US 10-digit numbers, so the common case is +1 + 10
 * digits; already-+-prefixed and 11-digit (leading 1) inputs pass through.
 */
function toE164(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

// SMS via Twilio (same account as the missed-call tool). The twilio package is
// imported lazily and only when all three credentials are present, so without
// them the send is skipped (logged) and the dependency never loads. Turning SMS
// on is just adding TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_NUMBER.
export async function sendSms(to: string, body: string): Promise<{ sent: boolean }> {
  const sid = env.twilioAccountSid;
  const token = env.twilioAuthToken;
  const from = env.twilioNumber;

  if (!sid || !token || !from) {
    console.log(`[sms skipped: no Twilio creds] to=${to} body=${JSON.stringify(body)}`);
    return { sent: false };
  }

  const twilio = (await import("twilio")).default;
  const client = twilio(sid, token);
  await client.messages.create({ to: toE164(to), from, body });
  return { sent: true };
}
