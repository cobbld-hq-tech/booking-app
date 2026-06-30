import { sendEmail } from "./email";
import { sendSms } from "./sms";
import { SHOP } from "./business-hours";
import { formatLongDate, formatTime } from "./time";
import { renderBookingEmail, type EmailRow } from "./email-template";

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

/** The labelled detail rows shared by both styled emails. */
function detailRows(b: NotifiableBooking): EmailRow[] {
  const start = new Date(b.startIso);
  return [
    { label: "Service", value: b.serviceName },
    { label: "Date", value: formatLongDate(start) },
    { label: "Time", value: `${formatTime(start)} ${SHOP.tzLabel}`, mono: true },
    { label: "Name", value: b.customerName },
  ];
}

/** Immediate "you're booked" confirmation. No wait, so this is a plain send. */
export async function sendBookingConfirmation(b: NotifiableBooking): Promise<void> {
  const when = whenLine(b.startIso);
  const sms = `You're booked at ${SHOP.name}: ${b.serviceName} on ${when}. Need to change it? Call ${SHOP.phone}.`;
  const subject = `You're booked at ${SHOP.name}`;
  const text =
    `Hi ${b.customerName},\n\n` +
    `You're booked at ${SHOP.name}.\n\n` +
    `${b.serviceName}\n${when}\n\n` +
    `Need to change it? Call ${SHOP.phone}.\n\n` +
    `See you then.`;
  const html = renderBookingEmail({
    preheader: `Your ${b.serviceName} is booked for ${when}.`,
    heading: "You're booked.",
    intro: `See you at ${SHOP.name}. We'll have the bay ready.`,
    rows: detailRows(b),
    note: `Need to change it? Call ${SHOP.phone}.`,
  });
  await deliver(b, { sms, subject, text, html });
}

/** The same-day reminder nudge, sent from the Inngest function after its durable
 *  wait. The booking confirmation is sent separately, on insert. */
export async function sendBookingReminder(b: NotifiableBooking): Promise<void> {
  const when = whenLine(b.startIso);
  const sms = `See you soon at ${SHOP.name}: your ${b.serviceName} is coming up on ${when}. Call ${SHOP.phone} if anything changes.`;
  const subject = `See you soon at ${SHOP.name}`;
  const text =
    `Hi ${b.customerName},\n\n` +
    `Just a heads up that your ${b.serviceName} at ${SHOP.name} is coming up soon:\n\n` +
    `${when}\n\n` +
    `See you in a bit. Call ${SHOP.phone} if anything changes.`;
  const html = renderBookingEmail({
    preheader: `Your ${b.serviceName} is coming up: ${when}.`,
    heading: "See you soon.",
    intro: `Your appointment at ${SHOP.name} is coming up.`,
    rows: detailRows(b),
    note: `Need to reschedule? Call ${SHOP.phone}.`,
  });
  await deliver(b, { sms, subject, text, html });
}

async function deliver(
  b: NotifiableBooking,
  msg: { sms: string; subject: string; text: string; html: string },
): Promise<void> {
  // allSettled: a failure on one channel must not block the other.
  await Promise.allSettled([
    sendSms(b.customerPhone, msg.sms),
    b.customerEmail ? sendEmail(b.customerEmail, msg.subject, msg.text, msg.html) : Promise.resolve(),
  ]);
}
