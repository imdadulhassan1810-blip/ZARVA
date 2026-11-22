import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, useWindowDimensions, Easing, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import * as AppleAuthentication from "expo-apple-authentication";
import Svg, { Defs, LinearGradient as SvgGradient, Path, Polygon, Rect, Stop } from "react-native-svg";
import { logoRules } from "@zarva/brand";
import type { ApiClient, AuthProviders } from "@zarva/core";
import { CodeForm } from "./CodeForm";
import { GoogleLiveButton, googleClientIds } from "./GoogleLive";
import type { Theme } from "./theme";
import { haptic, Ionicons, type IconName } from "./ui";

/**
 * The first screen of both apps when signed out.
 *  1. The ZARVA mark pops in at the centre.
 *  2. Z-A-R-V-A slides in letter by letter (the logo kit's own letterforms, not a font).
 *  3. The caption fades in below, then the sign-in options rise in.
 *
 * ZARVA (customers): Google, Email, Apple, Phone, then Customer sign up / Partner sign up.
 * ZARVA Partner: Phone only (partners are identified by their mobile number for KYC and payouts),
 * then the same two sign-up buttons. Each sign-up button that belongs to the other app opens the
 * other app; the two apps never share a screen or a session. The ZARVA team signs in elsewhere.
 */
export type LaunchView = "options" | "email" | "phone" | "signup" | "google-demo" | "apple-demo";

const PROVIDERS_OFF: AuthProviders = { phone: true, email: true, google: { mode: "off", clientId: null }, apple: { mode: "off", serviceId: null } };
const extra = (Constants.expoConfig?.extra ?? {}) as { partnerSignupUrl?: string; customerAppUrl?: string };

export function LaunchScreen({
  t, app, client, initialView = "options", onSignedIn, onOtherApp,
}: {
  t: Theme;
  app: "customer" | "partner";
  client: ApiClient;
  initialView?: LaunchView;
  onSignedIn: () => void;
  /** Development (Expo Go): switch to the other app in place. Store builds open the other app's page instead. */
  onOtherApp?: (view: LaunchView) => void;
}) {
  const [view, setView] = useState<LaunchView>(initialView);
  const [providers, setProviders] = useState<AuthProviders>(PROVIDERS_OFF);
  const [appleNative, setAppleNative] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const customer = app === "customer";
  // The animation waits until we know which buttons to show, so the logo's starting point is right.
  const [ready, setReady] = useState(!customer);

  useEffect(() => {
    if (!customer) return;
    const giveUp = setTimeout(() => setReady(true), 1500); // slow network: don't hold the intro back
    client.providers().then(setProviders).catch(() => setProviders(PROVIDERS_OFF)).finally(() => { clearTimeout(giveUp); setReady(true); });
    if (Platform.OS === "ios") void AppleAuthentication.isAvailableAsync().then(setAppleNative).catch(() => setAppleNative(false));
  }, [client, customer]);

  const done = async (p: Promise<unknown>) => {
    setError(null);
    try {
      await p;
      haptic.success();
      onSignedIn();
    } catch (e) {
      haptic.error();
      setError((e as Error).message);
    }
  };

  const otherApp = () => {
    haptic.impact();
    if (onOtherApp) return onOtherApp(customer ? "signup" : "options");
    const url = customer ? extra.partnerSignupUrl ?? "https://zarva.in/partner/login" : extra.customerAppUrl ?? "https://zarva.in/login";
    void Linking.openURL(url);
  };

  const appleSignIn = async () => {
    if (providers.apple.mode === "mock") return setView("apple-demo");
    try {
      const r = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      });
      if (!r.identityToken) throw new Error("Apple did not return a sign-in token. Please try again.");
      const name = [r.fullName?.givenName, r.fullName?.familyName].filter(Boolean).join(" ");
      await done(client.appleLogin(r.identityToken, name || undefined));
    } catch (e) {
      if ((e as { code?: string }).code === "ERR_REQUEST_CANCELED") return; // they closed Apple's sheet
      setError((e as Error).message);
    }
  };

  // Google: demo form in development; the real Google sheet in a build that has Google client ids.
  const googleLive = providers.google.mode === "live" && googleClientIds() !== null;
  const showGoogle = providers.google.mode === "mock" || googleLive;
  // Apple: demo form in development; the real Apple sheet on iPhones (Apple has no native Android sign-in).
  const showApple = providers.apple.mode === "mock" || (providers.apple.mode === "live" && appleNative);

  return (
    <View style={{ flex: 1, backgroundColor: t.ink }}>
      <StatusBar style="light" />
      <Glow />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bounces={false}>
          <SafeAreaView
            edges={["top", "bottom"]}
            style={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 20, paddingVertical: 24, gap: 28 }}
          >
            <BrandIntro compact={view !== "options"} ready={ready}>
              <View style={{ width: "100%", maxWidth: 440, alignSelf: "center", gap: 14 }}>
                {view === "options" ? (
                  <>
                    {customer && (
                      <View style={{ gap: 12 }}>
                        {showGoogle && (googleLive ? (
                          <GoogleLiveButton onToken={(idToken) => void done(client.googleLogin(idToken))} onError={setError}>
                            {(start, ready) => <LaunchButton icon="logo-google" title="Continue with Google" onPress={start} disabled={!ready} />}
                          </GoogleLiveButton>
                        ) : (
                          <LaunchButton icon="logo-google" title="Continue with Google" onPress={() => setView("google-demo")} />
                        ))}
                        <LaunchButton icon="mail-outline" title="Continue with Email" onPress={() => setView("email")} />
                        {showApple && <LaunchButton icon="logo-apple" title="Continue with Apple" onPress={() => void appleSignIn()} />}
                        <LaunchButton icon="phone-portrait-outline" title="Continue with Phone" onPress={() => setView("phone")} />
                      </View>
                    )}
                    {!customer && <LaunchButton icon="phone-portrait-outline" title="Continue with Phone" onPress={() => setView("phone")} />}
                    {error && <Text accessibilityRole="alert" style={{ color: "#FF9AA2", textAlign: "center" }}>{error}</Text>}

                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6 }}>
                      <View style={{ flex: 1, height: 1, backgroundColor: "rgba(246,245,251,0.14)" }} />
                      <Text style={{ color: "#8E88B0", fontSize: 13 }}>{customer ? "New to ZARVA?" : "New to ZARVA Partner?"}</Text>
                      <View style={{ flex: 1, height: 1, backgroundColor: "rgba(246,245,251,0.14)" }} />
                    </View>
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <SignupButton title="Customer sign up" colors={[t.primaryFrom, t.primaryTo]} fg="#fff" onPress={() => (customer ? setView("signup") : otherApp())} />
                      <SignupButton title="Partner sign up" colors={[t.homeFrom, t.homeTo]} fg={t.ink} onPress={() => (customer ? otherApp() : setView("signup"))} />
                    </View>
                    <Text style={{ color: "#8E88B0", fontSize: 12, textAlign: "center" }}>No password needed. By continuing you agree to ZARVA&apos;s terms and privacy policy.</Text>
                  </>
                ) : (
                  <Panel t={t} onBack={() => { setError(null); setView("options"); }}>
                    {view === "email" && (
                      <>
                        <Heading t={t} title="Continue with Email" />
                        <CodeForm key="email" t={t} kind="email" onSend={(e) => client.requestEmailCode(e)} onVerify={async (e, c) => { await client.verifyEmailCode(e, c); onSignedIn(); }} />
                      </>
                    )}
                    {view === "phone" && (
                      <>
                        <Heading t={t} title="Continue with Phone" />
                        <CodeForm key="phone" t={t} kind="phone" onSend={(p) => client.requestOtp(p)} onVerify={async (p, c) => { await client.verifyOtp(p, c); onSignedIn(); }} />
                      </>
                    )}
                    {view === "signup" && (
                      <>
                        <Heading
                          t={t}
                          title={customer ? "Create your customer account" : "Join ZARVA as a partner"}
                          body={customer
                            ? "Start with your mobile number: bookings need it so your professional can reach you. You can add email, Google or Apple later."
                            : "Sign up with your mobile number. Next you add your skills, ID proof and payout details, and we review them."}
                        />
                        <CodeForm key="signup" t={t} kind="phone" onSend={(p) => client.requestOtp(p)} onVerify={async (p, c) => { await client.verifyOtp(p, c); onSignedIn(); }} />
                      </>
                    )}
                    {view === "google-demo" && (
                      <DemoForm t={t} title="Demo Google sign-in" body="Real Google sign-in turns on in a store build with Google client IDs. Enter any Gmail address to try it." emailLabel="Gmail address" placeholder="you@gmail.com" error={error}
                        onSubmit={(email, name) => done(client.googleLogin(`mock:${email}:${name}`))} />
                    )}
                    {view === "apple-demo" && (
                      <DemoForm t={t} title="Demo Apple sign-in" body="Real Sign in with Apple turns on in the iPhone store build. Enter any email to try it." emailLabel="Apple ID email" placeholder="you@icloud.com" error={error}
                        onSubmit={(email, name) => done(client.appleLogin(`mock:${email}`, name || undefined))} />
                    )}
                    {(view === "email" || view === "phone" || view === "signup") && (
                      <Text style={{ color: t.muted, fontSize: 12 }}>We send a one-time code. No password needed.</Text>
                    )}
                  </Panel>
                )}
              </View>
            </BrandIntro>
          </SafeAreaView>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/* ---------------- The animation ---------------- */

const LETTERS = [
  "M0 0 H60 L0 80 H60",
  "M82 80 L112 0 L142 80",
  "M164 80 V0 H192 A20 20 0 0 1 192 40 H164 M186 40 L216 80",
  "M240 0 L270 80 L300 0",
  "M322 80 L352 0 L382 80",
];
const WORD_W = 200;
const WORD_H = (WORD_W * 132) / 422;

/**
 * Plays once per mount. The logo starts in the middle of the screen; when the sign-in options rise
 * in, it glides up to make room. Uses the native driver (runs on the UI thread, smooth even while
 * the JS thread loads). People who turn on Reduce Motion see everything in place straight away.
 */
function BrandIntro({ compact, ready, children }: { compact: boolean; ready: boolean; children: ReactNode }) {
  const mark = useRef(new Animated.Value(0)).current;
  const letters = useRef(LETTERS.map(() => new Animated.Value(0))).current;
  const caption = useRef(new Animated.Value(0)).current;
  const actions = useRef(new Animated.Value(0)).current;
  // Half the height of the options below the logo (plus the gap): how far the logo sits lower while alone.
  const [brandH, setBrandH] = useState<number | null>(null);
  const [actionsH, setActionsH] = useState<number | null>(null);
  const win = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // How far below its resting place the logo starts, so that it begins in the middle of the screen.
  // The column (logo, gap, options) is centred, so the logo rests half of "gap + options" above the
  // middle; on a short screen the column starts at the top instead, so it rests lower than that.
  const shift = ready && brandH !== null && actionsH !== null
    ? Math.round(Math.max(0, Math.min((actionsH + 28) / 2, (win.height - brandH) / 2 - insets.top - 24)))
    : null;

  useEffect(() => {
    if (shift === null) return; // wait until the layout has been measured
    let cancelled = false;
    const all = [mark, ...letters, caption, actions];
    void AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then((reduce) => {
      if (cancelled) return;
      if (reduce) return all.forEach((v) => v.setValue(1));
      const ease = Easing.out(Easing.cubic);
      Animated.sequence([
        Animated.spring(mark, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
        Animated.stagger(130, letters.map((v) => Animated.timing(v, { toValue: 1, duration: 380, easing: ease, useNativeDriver: true }))),
        Animated.timing(caption, { toValue: 1, duration: 420, easing: ease, useNativeDriver: true }),
        Animated.delay(250),
        Animated.timing(actions, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      ]).start();
    });
    return () => { cancelled = true; };
    // Start once, as soon as the first measurement is in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift === null, mark, letters, caption, actions]);

  const markSize = compact ? 56 : 92;
  return (
    <>
      <Animated.View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`ZARVA. ${logoRules.tagline}`}
        onLayout={(e) => setBrandH(e.nativeEvent.layout.height)}
        style={{ alignItems: "center", gap: compact ? 8 : 14, transform: [{ translateY: actions.interpolate({ inputRange: [0, 1], outputRange: [shift ?? 0, 0] }) }] }}
      >
        <Animated.View style={{ opacity: mark, transform: [{ scale: mark.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] }}>
          <Mark size={markSize} />
        </Animated.View>
        <View style={{ width: compact ? WORD_W * 0.7 : WORD_W, height: compact ? WORD_H * 0.7 : WORD_H }}>
          {LETTERS.map((d, i) => (
            <Animated.View
              key={i}
              style={{
                position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                opacity: letters[i],
                transform: [{ translateX: letters[i]!.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
              }}
            >
              <Svg width="100%" height="100%" viewBox="-20 -26 422 132">
                <Path d={d} fill="none" stroke="#F6F5FB" strokeWidth={11} strokeLinecap="square" strokeLinejoin="miter" strokeMiterlimit={4} />
              </Svg>
            </Animated.View>
          ))}
        </View>
        <Animated.Text style={{ opacity: caption, color: "#B9B4D6", fontSize: compact ? 13 : 15, fontWeight: "500", letterSpacing: 0.3 }}>{logoRules.tagline}</Animated.Text>
      </Animated.View>
      <Animated.View
        onLayout={(e) => setActionsH(e.nativeEvent.layout.height)}
        style={{ opacity: actions, transform: [{ translateY: actions.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }}
      >
        {children}
      </Animated.View>
    </>
  );
}

/** The colour mark from the logo kit (svg/zarva-mark-color.svg). Never recoloured. */
function Mark({ size }: { size: number }) {
  return (
    <Svg width={size} height={(size * 84) / 80} viewBox="10 8 80 84">
      <Defs>
        <SvgGradient id="lfood" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#FF7A6B" /><Stop offset="1" stopColor="#E8475A" /></SvgGradient>
        <SvgGradient id="lshop" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#3FD08F" /><Stop offset="1" stopColor="#139E66" /></SvgGradient>
        <SvgGradient id="levent" x1="1" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#9D82FF" /><Stop offset="1" stopColor="#FF6F91" /></SvgGradient>
        <SvgGradient id="ltravel" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#5B92FF" /><Stop offset="1" stopColor="#2F5FE0" /></SvgGradient>
        <SvgGradient id="lhome" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#FFC54D" /><Stop offset="1" stopColor="#F09A12" /></SvgGradient>
      </Defs>
      <Rect x="14" y="12" width="34" height="16" rx="8" fill="url(#lfood)" />
      <Rect x="52" y="12" width="34" height="16" rx="8" fill="url(#lshop)" />
      <Polygon points="59,37 83,37 41,63 17,63" fill="url(#levent)" stroke="url(#levent)" strokeWidth={6} strokeLinejoin="round" />
      <Rect x="14" y="72" width="34" height="16" rx="8" fill="url(#ltravel)" />
      <Rect x="52" y="72" width="34" height="16" rx="8" fill="url(#lhome)" />
    </Svg>
  );
}

/** Soft colour glows behind the logo, like the website's hero. */
function Glow() {
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
      <View style={{ position: "absolute", left: -120, top: -140, width: 320, height: 320, borderRadius: 160, backgroundColor: "#9D82FF", opacity: 0.16 }} />
      <View style={{ position: "absolute", right: -140, bottom: -160, width: 360, height: 360, borderRadius: 180, backgroundColor: "#FFC54D", opacity: 0.11 }} />
    </View>
  );
}

/* ---------------- Pieces ---------------- */

function LaunchButton({ icon, title, onPress, disabled }: { icon: IconName; title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={() => { haptic.tap(); onPress(); }}
      style={({ pressed }) => ({
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, minHeight: 52, borderRadius: 14,
        backgroundColor: pressed ? "#ECE9F7" : "#FFFFFF", opacity: disabled ? 0.6 : 1, transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <Ionicons name={icon} size={20} color="#0F0B24" />
      <Text style={{ color: "#0F0B24", fontSize: 16, fontWeight: "700" }}>{title}</Text>
    </Pressable>
  );
}

function SignupButton({ title, colors, fg, onPress }: { title: string; colors: [string, string]; fg: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flex: 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 }}>
        <Text style={{ color: fg, fontWeight: "800", fontSize: 15 }} numberOfLines={1} adjustsFontSizeToFit>{title}</Text>
      </LinearGradient>
    </Pressable>
  );
}

function Panel({ t, onBack, children }: { t: Theme; onBack: () => void; children: ReactNode }) {
  return (
    <View style={{ backgroundColor: t.bg, borderRadius: 22, padding: 18, gap: 14 }}>
      <Pressable accessibilityRole="button" onPress={onBack} hitSlop={10} style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" }}>
        <Ionicons name="chevron-back" size={18} color={t.primary} />
        <Text style={{ color: t.primary, fontWeight: "700" }}>All sign-in options</Text>
      </Pressable>
      {children}
    </View>
  );
}

function Heading({ t, title, body }: { t: Theme; title: string; body?: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: t.text, fontSize: 20, fontWeight: "800" }}>{title}</Text>
      {body && <Text style={{ color: t.muted, lineHeight: 20 }}>{body}</Text>}
    </View>
  );
}

function DemoForm({ t, title, body, emailLabel, placeholder, error, onSubmit }: {
  t: Theme; title: string; body: string; emailLabel: string; placeholder: string; error: string | null;
  onSubmit: (email: string, name: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const input = { borderWidth: 1, borderColor: t.border, borderRadius: 12, paddingHorizontal: 14, minHeight: 48, color: t.text, backgroundColor: t.surface, fontSize: 16 } as const;
  return (
    <View style={{ gap: 12 }}>
      <Heading t={t} title={title} body={body} />
      <Text style={{ color: t.text, fontWeight: "600" }}>{emailLabel}</Text>
      <TextInput value={email} onChangeText={setEmail} placeholder={placeholder} placeholderTextColor={t.muted} autoCapitalize="none" keyboardType="email-address" autoFocus style={input} />
      <Text style={{ color: t.text, fontWeight: "600" }}>Name</Text>
      <TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={t.muted} style={input} />
      {error && <Text accessibilityRole="alert" style={{ color: t.danger }}>{error}</Text>}
      <Pressable
        accessibilityRole="button"
        disabled={busy || !email.includes("@")}
        onPress={async () => { setBusy(true); await onSubmit(email.trim(), name.trim()); setBusy(false); }}
        style={{ opacity: busy || !email.includes("@") ? 0.5 : 1 }}
      >
        <LinearGradient colors={[t.primaryFrom, t.primaryTo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>{busy ? "Signing in…" : "Continue"}</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}
