import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { emailSchema, phoneSchema } from "@zarva/core";
import type { Theme } from "./theme";
import { Button, ErrorBanner, Field, haptic } from "./ui";

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
    try { await fn(); } catch (e) { haptic.error(); setError((e as Error).message); } finally { setBusy(false); }
  }

  const send = () => run(async () => {
    const p = (kind === "phone" ? phoneSchema : emailSchema).safeParse(value);
    if (!p.success) throw new Error(p.error.issues[0]?.message);
    await onSend(p.data);
    setNormalised(p.data);
    setSent(true);
  });
  const verify = () => run(async () => { await onVerify(normalised, code); haptic.success(); });

  return (
    <View style={{ gap: 14 }}>
      {!sent ? (
        <>
          {kind === "phone" ? (
            <Field t={t} label="Mobile number" prefix="+91" keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholder="98765 43210" value={value} onChangeText={setValue} returnKeyType="done" onSubmitEditing={send} />
          ) : (
            <Field t={t} label="Email address" icon="mail-outline" keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="you@example.com" value={value} onChangeText={setValue} returnKeyType="done" onSubmitEditing={send} />
          )}
          <Button t={t} loading={busy} title={kind === "phone" ? "Get OTP" : "Email me a code"} disabled={value.trim().length < 5} onPress={send} />
        </>
      ) : (
        <>
          <View style={{ gap: 4 }}>
            <Text style={{ color: t.muted }}>Enter the 6-digit code sent to</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ color: t.text, fontWeight: "700", fontSize: 16 }}>{kind === "phone" ? `+91 ${value}` : value}</Text>
              <Pressable accessibilityRole="button" hitSlop={10} onPress={() => { setSent(false); setCode(""); setError(null); }}>
                <Text style={{ color: t.primary, fontWeight: "700" }}>Change</Text>
              </Pressable>
            </View>
          </View>
          <TextInput
            accessibilityLabel="One-time code"
            autoFocus keyboardType="number-pad" autoComplete="sms-otp" textContentType="oneTimeCode" maxLength={6}
            value={code} onChangeText={(s) => setCode(s.replace(/\D/g, ""))}
            placeholder="••••••" placeholderTextColor={t.muted}
            style={{ minHeight: 60, borderWidth: 2, borderColor: code.length === 6 ? t.primary : t.border, borderRadius: 14, backgroundColor: t.surface, color: t.text, fontSize: 28, fontWeight: "700", letterSpacing: 14, textAlign: "center" }}
          />
          <Button t={t} loading={busy} title={submitLabel} disabled={code.length !== 6} onPress={verify} />
        </>
      )}
      {error && <ErrorBanner t={t} message={error} />}
    </View>
  );
}
