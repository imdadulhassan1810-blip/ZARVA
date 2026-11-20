"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { phoneSchema } from "@zarva/core";
import { api } from "../../lib/api";

export default function Login() {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
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
    const parsed = phoneSchema.safeParse(phone);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Invalid number");
    setBusy(true);
    try {
      const r = await api.requestOtp(parsed.data);
      setStep("otp");
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
      const r = await api.verifyOtp(phone, code);
      router.replace(r.isNewUser || !r.user.name ? "/account?welcome=1" : "/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "24px auto" }}>
      <h1>Sign in</h1>
      <p className="muted">We'll send a 6-digit code to your mobile number.</p>
      {step === "phone" ? (
        <form className="card stack" onSubmit={send}>
          <label>
            Mobile number
            <input inputMode="tel" autoComplete="tel" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn" disabled={busy}>{busy ? "Sending…" : "Send OTP"}</button>
        </form>
      ) : (
        <form className="card stack" onSubmit={verify}>
          <label>
            Code sent to {phone}
            <input className="otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Verify"}</button>
          <div className="row">
            <button type="button" className="btn btn-ghost" onClick={() => { setStep("phone"); setCode(""); }}>Change number</button>
            <button type="button" className="btn btn-ghost" disabled={wait > 0 || busy} onClick={() => send()}>{wait > 0 ? `Resend in ${wait}s` : "Resend"}</button>
          </div>
        </form>
      )}
    </div>
  );
}
