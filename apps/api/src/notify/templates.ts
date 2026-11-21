/**
 * Every SMS / WhatsApp message ZARVA sends. In India each SMS text must be registered on the DLT
 * portal (TRAI) word for word, with {#var#} where the variables go; WhatsApp templates must be
 * approved by Meta. Register exactly the `sms` text below (see docs/notifications.md), then put
 * the template ids in MSG91_SMS_TEMPLATES and create WhatsApp templates named zarva_<event>.
 *
 * Variables are kept short: DLT allows at most 30 characters per variable.
 */
export const notifyEvents = {
  // ----- Customer -----
  booking_confirmed: {
    vars: ["code", "service", "when"],
    sms: "ZARVA: Booking {code} for {service} on {when} is confirmed. We will share your professional's details soon.",
  },
  pro_assigned: {
    vars: ["code", "pro", "when", "startCode"],
    sms: "ZARVA: {pro} will do your booking {code} on {when}. Give start code {startCode} only when they arrive.",
  },
  pro_on_the_way: {
    vars: ["code", "pro", "phone"],
    sms: "ZARVA: {pro} is on the way for booking {code}. Call {phone} if needed.",
  },
  job_completed: {
    vars: ["code", "amount"],
    sms: "ZARVA: Booking {code} is complete. Amount {amount}. Thank you for choosing ZARVA.",
  },
  booking_cancelled: {
    vars: ["code", "reason"],
    sms: "ZARVA: Booking {code} is cancelled. Reason: {reason}.",
  },
  refund_started: {
    vars: ["code", "amount"],
    sms: "ZARVA: Refund of {amount} for booking {code} has started. It reaches your account in 5-7 days.",
  },
  // ----- Professional -----
  pro_job_assigned: {
    vars: ["code", "when", "area"],
    sms: "ZARVA Partner: New job {code} on {when} at {area}. Open the partner app for details.",
  },
  pro_job_cancelled: {
    vars: ["code", "when"],
    sms: "ZARVA Partner: Job {code} on {when} has been cancelled. Please do not go to the customer.",
  },
  pro_approved: {
    vars: ["name"],
    sms: "ZARVA Partner: Welcome {name}, your profile is approved. You can now accept jobs in the partner app.",
  },
  pro_rejected: {
    vars: ["reason"],
    sms: "ZARVA Partner: We could not approve your profile yet. Reason: {reason}. Please fix it in the partner app.",
  },
  pro_payout_details_changed: {
    vars: ["destination"],
    sms: "ZARVA Partner: Your payout account was changed to {destination}. If you did not do this, call ZARVA support now.",
  },
  payout_paid: {
    vars: ["amount", "destination", "utr"],
    sms: "ZARVA Partner: {amount} has been paid to {destination}. Reference {utr}.",
  },
} as const satisfies Record<string, { vars: readonly string[]; sms: string }>;

export type NotifyEvent = keyof typeof notifyEvents;
export type NotifyVars<E extends NotifyEvent> = Record<(typeof notifyEvents)[E]["vars"][number], string>;

/** DLT limit per variable. */
export const MAX_VAR_LEN = 30;

export function clipVar(v: string): string {
  const s = v.replace(/\s+/g, " ").trim();
  return s.length <= MAX_VAR_LEN ? s : `${s.slice(0, MAX_VAR_LEN - 1)}…`;
}

export function renderText(event: NotifyEvent, vars: Record<string, string>): string {
  return notifyEvents[event].sms.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
}

/** Variable names in the order they appear in the text: DLT var1, var2... and WhatsApp {{1}}, {{2}}... */
export function varOrder(event: NotifyEvent): string[] {
  return [...notifyEvents[event].sms.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
}

/** Variable values in text order, for providers that take them positionally. */
export function orderedVars(event: NotifyEvent, vars: Record<string, string>): string[] {
  return varOrder(event).map((k) => vars[k] ?? "");
}

/** The DLT-registrable form of an SMS: {#var#} in place of each variable. */
export function dltText(event: NotifyEvent): string {
  return notifyEvents[event].sms.replace(/\{\w+\}/g, "{#var#}");
}
