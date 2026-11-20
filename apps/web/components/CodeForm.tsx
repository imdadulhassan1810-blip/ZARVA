"use client";
import { useEffect, useState } from "react";
import { emailSchema, phoneSchema } from "@zarva/core";

/**
 * Two-step "send me a code" form for a phone number or an email address.
 * The parent decides what sending and verifying do (sign in, or add to the account).
 */
export function CodeForm({
  kind,
  submitLabel = "Verify",
  onSend,
  onVerify,
  initialValue = "",
}: {
  kind: "phone" | "email";
  submitLabel?: string;
  onSend: (value: string) => Promise<{ retryAfter: number }>;
  onVerify: (value: string, code: string) => Promise<void>;
  initialValue?: string;
}) {
  const [step, setStep] = useState<"enter" | "code">("enter");
  const [value, setValue] = useState(initialValue);
  const [normalised, setNormalised] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    const parsed = (kind === "phone" ? phoneSchema : emailSchema).safeParse(value);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check what you typed");
    setBusy(true);
    try {
      const r = await onSend(parsed.data);
      setNormalised(parsed.data);
      setStep("code");
      setCode("");
      setWait(r.retryAfter);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onVerify(normalised, code);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (step === "enter") {
    return (
      <form className="stack" onSubmit={send}>
        <label>
          {kind === "phone" ? "Mobile number" : "Email address"}
          {kind === "phone" ? (
            <input inputMode="tel" autoComplete="tel" placeholder="98765 43210" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          ) : (
            <input type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          )}
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn" disabled={busy}>{busy ? "Sending…" : kind === "phone" ? "Send OTP" : "Email me a code"}</button>
      </form>
    );
  }
  return (
    <form className="stack" onSubmit={verify}>
      <label>
        6-digit code sent to {value}
        <input className="otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn" disabled={busy || code.length !== 6}>{busy ? "Checking…" : submitLabel}</button>
      <div className="row">
        <button type="button" className="btn btn-ghost" onClick={() => setStep("enter")}>Change {kind === "phone" ? "number" : "email"}</button>
        <button type="button" className="btn btn-ghost" disabled={wait > 0 || busy} onClick={() => send()}>{wait > 0 ? `Resend in ${wait}s` : "Resend"}</button>
      </div>
    </form>
  );
}
