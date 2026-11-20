/**
 * SMS OTP delivery. India requires DLT registration (TRAI) of the sender ID and the
 * exact message template before any SMS gateway will deliver. Budget 1-2 weeks for it.
 */
export interface OtpSender {
  send(phone: string, code: string): Promise<void>;
}

export class ConsoleOtpSender implements OtpSender {
  async send(phone: string, code: string) {
    console.log(`[otp] ${phone} -> ${code}`);
    console.log(`\n  >>> OTP for ${phone}: ${code} <<<\n`);
  }
}

/** Keeps the last code per phone. Used by tests. */
export class MemoryOtpSender implements OtpSender {
  last = new Map<string, string>();
  async send(phone: string, code: string) {
    this.last.set(phone, code);
  }
}

export class Msg91OtpSender implements OtpSender {
  constructor(private authKey: string, private templateId: string, private fetchImpl: typeof fetch = fetch) {
    if (!authKey || !templateId) throw new Error("MSG91_AUTH_KEY and MSG91_TEMPLATE_ID are required");
  }
  async send(phone: string, code: string) {
    const res = await this.fetchImpl("https://control.msg91.com/api/v5/flow", {
      method: "POST",
      headers: { authkey: this.authKey, "content-type": "application/json" },
      body: JSON.stringify({ template_id: this.templateId, recipients: [{ mobiles: phone.replace("+", ""), otp: code }] }),
    });
    if (!res.ok) throw new Error(`MSG91 send failed with ${res.status}`);
  }
}
