import { z } from "zod";
import { HOME_RULES, formatRupees } from "./home";

/**
 * Customer support and feedback. Platform-wide (not one vertical): a ticket can point at a booking
 * in any module (module + referenceId), and the module confirms the booking belongs to the customer.
 */

export const supportTopics = ["booking_issue", "payment_refund", "pro_behaviour", "app_problem", "account", "other"] as const;
export type SupportTopic = (typeof supportTopics)[number];
export const supportTopicLabel: Record<SupportTopic, string> = {
  booking_issue: "Problem with a booking",
  payment_refund: "Payment or refund",
  pro_behaviour: "Professional's behaviour",
  app_problem: "App or website not working",
  account: "My account",
  other: "Something else",
};

/** open: waiting for ZARVA. waiting_customer: ZARVA replied. resolved: closed (a new customer reply reopens it). */
export const supportStatuses = ["open", "waiting_customer", "resolved"] as const;
export type SupportStatus = (typeof supportStatuses)[number];
export const supportStatusLabel: Record<SupportStatus, string> = {
  open: "Waiting for ZARVA",
  waiting_customer: "ZARVA replied",
  resolved: "Resolved",
};

export const SUPPORT_RULES = {
  maxOpenTickets: 5,
  maxMessage: 2000,
  /** Tickets created per customer per day, against spam. */
  perDay: 10,
  feedbackPerDay: 5,
} as const;

export const supportCreateSchema = z.object({
  topic: z.enum(supportTopics),
  subject: z.string().trim().min(4, "Add a short subject").max(120),
  message: z.string().trim().min(10, "Tell us a little more (at least 10 characters)").max(SUPPORT_RULES.maxMessage),
  /** Optional booking this is about, e.g. { module: "home", referenceId: <booking id> }. */
  module: z.enum(["home"]).optional(),
  referenceId: z.string().uuid().optional(),
}).refine((v) => !v.referenceId === !v.module, "Booking reference needs its module");
export type SupportCreate = z.infer<typeof supportCreateSchema>;

export const supportReplySchema = z.object({ message: z.string().trim().min(1).max(SUPPORT_RULES.maxMessage) });

export interface SupportMessage { id: string; from: "customer" | "zarva"; authorName: string; body: string; at: string }
export interface SupportTicket {
  id: string;
  /** Short reference to quote on the phone, e.g. "ZT-1042". */
  code: string;
  topic: SupportTopic;
  topicLabel: string;
  subject: string;
  status: SupportStatus;
  statusLabel: string;
  module: string | null;
  referenceId: string | null;
  /** e.g. "Booking ZH-7K3QF2 · Electrician". */
  referenceLabel: string | null;
  messages: SupportMessage[];
  createdAt: string;
  updatedAt: string;
  /** Admin only. */
  customer?: { id: string; name: string | null; phone: string | null; email: string | null };
}

export const feedbackKinds = ["suggestion", "bug", "compliment", "complaint", "other"] as const;
export type FeedbackKind = (typeof feedbackKinds)[number];
export const feedbackKindLabel: Record<FeedbackKind, string> = {
  suggestion: "Idea or suggestion", bug: "Something is broken", compliment: "Compliment", complaint: "Complaint", other: "Other",
};
export const feedbackSchema = z.object({
  kind: z.enum(feedbackKinds),
  /** How happy with ZARVA overall, 1-5. Optional. */
  rating: z.number().int().min(1).max(5).optional(),
  message: z.string().trim().min(5, "Write at least a few words").max(SUPPORT_RULES.maxMessage),
  /** Where it was sent from, e.g. "web" or "ios". */
  platform: z.enum(["web", "ios", "android", "app"]).default("web"),
});
export type FeedbackInput = z.infer<typeof feedbackSchema>;
export interface Feedback {
  id: string; kind: FeedbackKind; rating: number | null; message: string; platform: string; createdAt: string;
  customer: { name: string | null; phone: string | null; email: string | null } | null;
}

export function ticketCode(n: number): string {
  return `ZT-${1000 + n}`;
}

/** Help centre answers. Every line must be true of how the app works today; update when rules change. */
export interface FaqItem { q: string; a: string }
export interface FaqSection { title: string; items: FaqItem[] }
export const supportFaq: FaqSection[] = [
  {
    title: "Bookings",
    items: [
      { q: "How early can I book?", a: `Pick any 1-hour arrival slot from ${HOME_RULES.leadTimeMinutes / 60} hours from now, up to ${HOME_RULES.bookingWindowDays} days ahead, between 8 AM and 8 PM.` },
      { q: "What is the start code?", a: "A 4-digit code shown on your booking. Tell it to the professional only when they reach your home. They can't start the job without it, so only your assigned professional can begin." },
      { q: "Can I book services from two categories together?", a: "Not in one booking. Book one category at a time, for example all electrician jobs together, then make a second booking for cleaning." },
      { q: "Where do I see my booking?", a: "Open Bookings. Each booking shows its status, the professional's name and phone once assigned, the start code, the bill and a timeline." },
    ],
  },
  {
    title: "Cancellation and refunds",
    items: [
      { q: "Can I cancel?", a: `Yes, free, until ${HOME_RULES.freeCancelMinutes / 60} hours before your slot, from the booking page. After that, raise a ticket and our team will help.` },
      { q: "When do I get my refund?", a: "If you paid online, the refund starts as soon as the booking is cancelled and reaches your bank or UPI app in 5-7 working days." },
    ],
  },
  {
    title: "Payment and bills",
    items: [
      { q: "How do I pay?", a: `Pay after the service in cash or UPI to the professional, or online where available. Orders above ${formatRupees(HOME_RULES.freeFeeAbovePaise)} have no convenience fee; smaller orders pay ${formatRupees(HOME_RULES.convenienceFeePaise)}.` },
      { q: "Are spare parts included?", a: "No. The price covers the service. Spare parts are extra and billed at MRP. Never pay more than the price in the app for the service itself; if asked, raise a ticket." },
      { q: "How do I get a bill or invoice?", a: "Once a job is completed, open the booking and tap Download invoice. You get a PDF with the services, amount and how you paid." },
    ],
  },
  {
    title: "Ratings and safety",
    items: [
      { q: "How do ratings work?", a: "After a job is completed you can rate the professional from 1 to 5 stars, within 30 days. You can change your rating for 7 days. Only customers who actually booked can rate, so every review is from a real job." },
      { q: "Are professionals verified?", a: "Every professional uploads an ID proof and a photo, which the ZARVA team checks before they can take jobs." },
      { q: "The professional was rude or asked for extra money. What do I do?", a: "Raise a ticket on that booking and choose \"Professional's behaviour\". Our team reads every one." },
    ],
  },
];
