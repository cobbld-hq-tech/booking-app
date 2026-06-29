import { sendEmail } from "./email";
import { sendSms } from "./sms";
import { SHOP } from "./business-hours";
import { formatLongDate, formatTime } from "./time";

// Message composition for the two POC notifications: the immediate confirmation
// (a plain send on insert) and the 24h reminder (sent from the Inngest function).
// Both go out over SMS + email (email only when the customer gave one). Copy
// follows the cobbld voice: plain, no em dashes, no fabricated claims.

export interface NotifiableBooking {
  serviceName: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  startIso: string;
}

function whenLine(startIso: string): string {
  const d = new Date(startIso);
  return `${formatLongDate(d)} at ${formatTime(d)} ${SHOP.tzLabel}`;
}

/** Immediate "you're booked" confirmation. No wait, so this is a plain send. */
export async function sendBookingConfirmation(b: NotifiableBooking): Promise<void> {
  const when = whenLine(b.startIso);
  const sms = `You're booked at ${SHOP.name}: ${b.serviceName} on ${when}. Need to change it? Call ${SHOP.phone}.`;
  const subject = `You're booked at ${SHOP.name}`;
  const email =
    `Hi ${b.customerName},\n\n` +
    `You're booked at ${SHOP.name}.\n\n` +
    `${b.serviceName}\n${when}\n\n` +
    `Need to change it? Call ${SHOP.phone}.\n\n` +
    `See you then.`;
  await deliver(b, { sms, subject, email });
}

/** The 24h reminder, sent from the Inngest function after its durable wait. */
export async function sendBookingReminder(b: NotifiableBooking): Promise<void> {
  const when = whenLine(b.startIso);
  const sms = `Reminder from ${SHOP.name}: your ${b.serviceName} is coming up on ${when}. Call ${SHOP.phone} to reschedule.`;
  const subject = `Reminder: your appointment at ${SHOP.name}`;
  const email =
    `Hi ${b.customerName},\n\n` +
    `A quick reminder that your ${b.serviceName} at ${SHOP.name} is coming up:\n\n` +
    `${when}\n\n` +
    `Need to reschedule? Call ${SHOP.phone}.\n\n` +
    `See you then.`;
  await deliver(b, { sms, subject, email });
}

async function deliver(
  b: NotifiableBooking,
  msg: { sms: string; subject: string; email: string },
): Promise<void> {
  // allSettled: a failure on one channel must not block the other.
  await Promise.allSettled([
    sendSms(b.customerPhone, msg.sms),
    b.customerEmail ? sendEmail(b.customerEmail, msg.subject, msg.email) : Promise.resolve(),
  ]);
}
