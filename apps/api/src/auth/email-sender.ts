/** Sends 6-digit sign-in codes by email. */
export interface EmailSender {
  sendCode(email: string, code: string): Promise<void>;
}

export class ConsoleEmailSender implements EmailSender {
  async sendCode(email: string, code: string) {
    console.log(`\n  >>> Email code for ${email}: ${code} <<<\n`);
  }
}

export class MemoryEmailSender implements EmailSender {
  last = new Map<string, string>();
  async sendCode(email: string, code: string) {
    this.last.set(email, code);
  }
}

/**
 * Resend (resend.com): free tier is 3,000 emails/month, enough for launch.
 * Needs a verified sending domain (e.g. mail.zarva.in) to avoid the spam folder.
 */
export class ResendEmailSender implements EmailSender {
  constructor(private apiKey: string, private from: string, private fetchImpl: typeof fetch = fetch) {
    if (!apiKey || !from) throw new Error("RESEND_API_KEY and EMAIL_FROM are required");
  }
  async sendCode(email: string, code: string) {
    const res = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: this.from,
        to: [email],
        subject: `${code} is your ZARVA code`,
        text: `Your ZARVA sign-in code is ${code}. It expires in 5 minutes. If you didn't ask for it, ignore this email.`,
      }),
    });
    if (!res.ok) throw new Error(`Resend send failed with ${res.status}`);
  }
}
