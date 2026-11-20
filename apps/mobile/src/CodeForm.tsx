import { useState } from "react";
import { Text, View } from "react-native";
import { emailSchema, phoneSchema } from "@zarva/core";
import type { Theme } from "./theme";
import { Button, Field } from "./ui";

/** "Send me a code" then "enter the code", for a phone number or an email. */
export function CodeForm({
  t, kind, submitLabel = "Verify", onSend, onVerify,
}: {
  t: Theme;
  kind: "phone" | "email";
  submitLabel?: string;
  onSend: (value: string) => Promise<unknown>;
  onVerify: (value: string, code: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [normalised, setNormalised] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <View style={{ gap: 12 }}>
      {!sent ? (
        <>
          {kind === "phone" ? (
            <Field t={t} label="Mobile number" keyboardType="phone-pad" autoComplete="tel" placeholder="98765 43210" value={value} onChangeText={setValue} />
          ) : (
            <Field t={t} label="Email address" keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="you@example.com" value={value} onChangeText={setValue} />
          )}
          <Button t={t} title={busy ? "Sending…" : kind === "phone" ? "Send OTP" : "Email me a code"} disabled={busy} onPress={() => run(async () => {
            const p = (kind === "phone" ? phoneSchema : emailSchema).safeParse(value);
            if (!p.success) throw new Error(p.error.issues[0]?.message);
            await onSend(p.data);
            setNormalised(p.data);
            setSent(true);
          })} />
        </>
      ) : (
        <>
          <Field t={t} label={`Code sent to ${value}`} keyboardType="number-pad" autoComplete="sms-otp" textContentType="oneTimeCode" maxLength={6} value={code} onChangeText={(s) => setCode(s.replace(/\D/g, ""))} />
          <Button t={t} title={busy ? "Checking…" : submitLabel} disabled={busy || code.length !== 6} onPress={() => run(() => onVerify(normalised, code))} />
          <Button t={t} ghost title={kind === "phone" ? "Change number" : "Change email"} onPress={() => { setSent(false); setCode(""); }} />
        </>
      )}
      {error && <Text style={{ color: t.danger }}>{error}</Text>}
    </View>
  );
}
