import { orderedVars, type NotifyEvent } from "./templates";

export type NotifyChannel = "sms" | "whatsapp";

export interface OutgoingMessage {
  /** E.164, e.g. +919876543210 */
  to: string;
  event: NotifyEvent;
  vars: Record<string, string>;
  /** Rendered text. Console prints it; real providers send their registered template instead. */
  text: string;
}

export interface SendResult {
  /** sent: delivered to the provider. skipped: not sendable by design (e.g. template not registered yet). */
  status: "sent" | "skipped";
  providerMessageId?: string | null;
  reason?: string;
}

/** One way of reaching a phone. Throwing means "temporary failure, retry later". */
export interface MessageChannel {
  readonly channel: NotifyChannel;
  readonly name: string;
  send(m: OutgoingMessage): Promise<SendResult>;
}

/** Development: prints the message in the API terminal. Nothing leaves the computer. */
export class ConsoleChannel implements MessageChannel {
  readonly name = "console";
  constructor(readonly channel: NotifyChannel) {}
  async send(m: OutgoingMessage): Promise<SendResult> {
    console.log(`  [${this.channel === "sms" ? "SMS" : "WhatsApp"} to ${m.to}] ${m.text}`);
    return { status: "sent", providerMessageId: null };
  }
}

/** Tests: keeps every message in memory. Set failTimes to simulate an outage. */
export class MemoryChannel implements MessageChannel {
  readonly name = "memory";
  sent: OutgoingMessage[] = [];
  failTimes = 0;
  constructor(readonly channel: NotifyChannel) {}
  async send(m: OutgoingMessage): Promise<SendResult> {
    if (this.failTimes > 0) {
      this.failTimes--;
      throw new Error("Simulated provider outage");
    }
    this.sent.push(m);
    return { status: "sent", providerMessageId: `mem_${this.sent.length}` };
  }
}

/**
 * MSG91 Flow API. Each event needs its own DLT-approved template, created as a Flow in MSG91.
 * MSG91_SMS_TEMPLATES maps events to flow template ids: "booking_confirmed:65f0...,pro_assigned:65f1...".
 * Variables are sent as var1, var2... in the order of the template's variables.
 * Events without a template id are skipped (logged), so you can register templates one by one.
 */
export class Msg91SmsChannel implements MessageChannel {
  readonly channel = "sms" as const;
  readonly name = "msg91";
  constructor(private authKey: string, private templates: Map<string, string>, private fetchImpl: typeof fetch = fetch) {
    if (!authKey) throw new Error("SMS_PROVIDER=msg91 needs MSG91_AUTH_KEY");
  }
  async send(m: OutgoingMessage): Promise<SendResult> {
    const templateId = this.templates.get(m.event);
    if (!templateId) return { status: "skipped", reason: `No MSG91 template id for ${m.event} in MSG91_SMS_TEMPLATES` };
    const recipient: Record<string, string> = { mobiles: m.to.replace("+", "") };
    orderedVars(m.event, m.vars).forEach((v, i) => { recipient[`var${i + 1}`] = v; });
    const res = await this.fetchImpl("https://control.msg91.com/api/v5/flow", {
      method: "POST",
      headers: { authkey: this.authKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ template_id: templateId, short_url: "0", recipients: [recipient] }),
    });
    const json = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
    if (!res.ok || json.type === "error") throw new Error(`MSG91 ${res.status}: ${json.message ?? "send failed"}`);
    return { status: "sent", providerMessageId: json.message ?? null };
  }
}

/**
 * WhatsApp Cloud API (Meta). Each event needs an approved "utility" template named zarva_<event>
 * whose body has the same variables, in the same order, as {{1}}, {{2}}...
 * Needs a WhatsApp Business account: WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID.
 */
export class MetaWhatsAppChannel implements MessageChannel {
  readonly channel = "whatsapp" as const;
  readonly name = "meta";
  constructor(
    private token: string,
    private phoneNumberId: string,
    private lang = "en",
    private fetchImpl: typeof fetch = fetch,
    private apiVersion = "v21.0",
  ) {
    if (!token || !phoneNumberId) throw new Error("WHATSAPP_PROVIDER=meta needs WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID");
  }
  async send(m: OutgoingMessage): Promise<SendResult> {
    const res = await this.fetchImpl(`https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: m.to.replace("+", ""),
        type: "template",
        template: {
          name: `zarva_${m.event}`,
          language: { code: this.lang },
          components: [{ type: "body", parameters: orderedVars(m.event, m.vars).map((text) => ({ type: "text", text })) }],
        },
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
    if (!res.ok) {
      // 132001 = template does not exist / not approved yet. That won't fix itself on retry.
      if (json.error?.code === 132001) return { status: "skipped", reason: `WhatsApp template zarva_${m.event} not approved yet` };
      throw new Error(`WhatsApp ${res.status}: ${json.error?.message ?? "send failed"}`);
    }
    return { status: "sent", providerMessageId: json.messages?.[0]?.id ?? null };
  }
}

/** "booking_confirmed:123,pro_assigned:456" -> Map */
export function parseTemplateMap(raw: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const part of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [k, v] = part.split(":").map((s) => s.trim());
    if (k && v) m.set(k, v);
  }
  return m;
}
