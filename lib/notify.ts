import { sendEmail } from "./email";
import { sendSms } from "./sms";
import { SHOP } from "./business-hours";
import { formatLongDate, formatTime } from "./time";
import { renderBookingEmail, type EmailRow } from "./email-template";
import { env } from "./env";

// Message composition for the two POC notifications: the immediate confirmation
// (a plain send on insert) and the 24h reminder (sent from the Inngest function).
// Both go out over SMS + email (email only when the customer gave one). Copy
// follows the cobbld voice: plain, no em dashes, no fabricated claims.

export interface NotifiableBooking {
  id: string;
  serviceName: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  startIso: string;
}

/** The customer's magic-link page to view / cancel / reschedule their booking. */
function manageUrl(b: NotifiableBooking): string {
  return `${env.appBaseUrl}/manage/${b.id}`;
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
  const manage = manageUrl(b);
  const sms = `You're booked at ${SHOP.name}: ${b.serviceName} on ${when}. Manage or cancel: ${manage}`;
  const subject = `You're booked at ${SHOP.name}`;
  const text =
    `Hi ${b.customerName},\n\n` +
    `You're booked at ${SHOP.name}.\n\n` +
    `${b.serviceName}\n${when}\n\n` +
    `Manage your booking (cancel or reschedule):\n${manage}\n\n` +
    `Or call ${SHOP.phone}.\n\nSee you then.`;
  const html = renderBookingEmail({
    preheader: `Your ${b.serviceName} is booked for ${when}.`,
    heading: "You're booked.",
    intro: `See you at ${SHOP.name}. We'll have the bay ready.`,
    rows: detailRows(b),
    note: `Need to change it? Manage your booking below, or call ${SHOP.phone}.`,
    cta: { label: "Manage your booking", url: manage },
  });
  await deliver(b, { sms, subject, text, html });
}

/** The same-day reminder nudge, sent from the Inngest function after its durable
 *  wait. The booking confirmation is sent separately, on insert. */
export async function sendBookingReminder(b: NotifiableBooking): Promise<void> {
  const when = whenLine(b.startIso);
  const manage = manageUrl(b);
  const sms = `See you soon at ${SHOP.name}: your ${b.serviceName} is coming up on ${when}. Manage or cancel: ${manage}`;
  const subject = `See you soon at ${SHOP.name}`;
  const text =
    `Hi ${b.customerName},\n\n` +
    `Just a heads up that your ${b.serviceName} at ${SHOP.name} is coming up soon:\n\n` +
    `${when}\n\n` +
    `Need to reschedule? Manage your booking:\n${manage}\n\n` +
    `Or call ${SHOP.phone}.\n\nSee you in a bit.`;
  const html = renderBookingEmail({
    preheader: `Your ${b.serviceName} is coming up: ${when}.`,
    heading: "See you soon.",
    intro: `Your appointment at ${SHOP.name} is coming up.`,
    rows: detailRows(b),
    note: `Need to reschedule? Manage your booking below, or call ${SHOP.phone}.`,
    cta: { label: "Manage your booking", url: manage },
  });
  await deliver(b, { sms, subject, text, html });
}

/** A no-show win-back touch (1, 2, or 3), sent from the Inngest follow-up sequence.
 *  Each links back to the booking page so the customer can rebook in a tap. */
export async function sendNoShowFollowup(b: NotifiableBooking, touch: number): Promise<void> {
  const rebook = env.appBaseUrl;
  let heading: string;
  let intro: string;
  let note: string;
  let sms: string;

  if (touch <= 1) {
    heading = "We missed you.";
    intro = `Sorry we didn't see you for your ${b.serviceName} at ${SHOP.name}. Want to grab a new time?`;
    note = "No worries at all. Pick whatever works and we'll get you in.";
    sms = `Sorry we missed you at ${SHOP.name} for your ${b.serviceName}. Grab a new time: ${rebook}`;
  } else if (touch === 2) {
    heading = "Still here for you.";
    intro = `Happy to get you in at ${SHOP.name} whenever works for you.`;
    note = "Same easy booking, any open time.";
    sms = `Still happy to get you in at ${SHOP.name}. Pick a time: ${rebook}`;
  } else {
    heading = "Whenever you're ready.";
    intro = `We'll leave it here, but the door is open at ${SHOP.name} whenever you need us.`;
    note = "Book anytime. We'll be glad to see you.";
    sms = `The door is open at ${SHOP.name} whenever you need us. Book anytime: ${rebook}`;
  }

  const text = `Hi ${b.customerName},\n\n${intro}\n\n${note}\n\nBook a new time:\n${rebook}\n\nOr call ${SHOP.phone}.`;
  const html = renderBookingEmail({
    preheader: intro,
    heading,
    intro,
    rows: [{ label: "Service", value: b.serviceName }],
    note,
    cta: { label: "Book a new time", url: rebook },
  });
  await deliver(b, { sms, subject: heading, text, html });
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
