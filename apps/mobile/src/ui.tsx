/**
 * ZARVA mobile UI kit: the native building blocks every screen uses, so both apps feel like one
 * family. Large touch targets (48px+), haptics on taps that change something, skeletons while loading.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator, Animated, Image, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View,
  type StyleProp, type TextInputProps, type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Theme } from "./theme";

export type IconName = keyof typeof Ionicons.glyphMap;
export { Ionicons };

/* ---------- Haptics (no-ops on web) ---------- */
const native = Platform.OS === "ios" || Platform.OS === "android";
export const haptic = {
  tap: () => { if (native) void Haptics.selectionAsync().catch(() => {}); },
  impact: () => { if (native) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); },
  success: () => { if (native) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); },
  error: () => { if (native) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}); },
};

/* ---------- Logo ---------- */
export function Logo({ t, width = 120, onInk = false }: { t: Theme; width?: number; onInk?: boolean }) {
  // Horizontal lockup, kit minimum 120px wide. Never recoloured.
  const src = t.dark || onInk ? require("../assets/lockup-dark.png") : require("../assets/lockup-light.png");
  return <Image source={src} style={{ width: Math.max(width, 120), height: Math.max(width, 120) * 0.29 }} resizeMode="contain" accessibilityLabel="ZARVA" />;
}

/* ---------- Buttons ---------- */
type ButtonVariant = "primary" | "home" | "outline" | "plain" | "danger";
export function Button({
  t, title, onPress, disabled, loading, ghost, variant, icon, size = "lg", style,
}: {
  t: Theme; title: string; onPress: () => void; disabled?: boolean; loading?: boolean;
  /** Old name for variant="outline". */
  ghost?: boolean; variant?: ButtonVariant; icon?: IconName; size?: "lg" | "md" | "sm"; style?: StyleProp<ViewStyle>;
}) {
  const v: ButtonVariant = variant ?? (ghost ? "outline" : "primary");
  const h = size === "lg" ? 52 : size === "md" ? 44 : 36;
  const fg = v === "primary" || v === "danger" ? "#fff" : v === "home" ? t.onHome : v === "plain" ? t.primary : t.text;
  const inner = (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: h, paddingHorizontal: size === "sm" ? 12 : 20 }}>
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={size === "sm" ? 16 : 19} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: "700", fontSize: size === "sm" ? 14 : 16 }} numberOfLines={1}>{title}</Text>
    </View>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!loading }}
      onPress={() => { haptic.tap(); onPress(); }}
      disabled={disabled || loading}
      style={({ pressed }) => [{
        borderRadius: size === "sm" ? 10 : 14, overflow: "hidden",
        backgroundColor: v === "primary" ? t.primary : v === "danger" ? t.danger : v === "outline" ? t.surface : "transparent",
        borderWidth: v === "outline" ? 1 : 0, borderColor: t.border,
        opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed ? 0.98 : 1 }],
      }, style]}
    >
      {v === "home" ? <LinearGradient colors={[t.homeFrom, t.homeTo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>{inner}</LinearGradient> : inner}
    </Pressable>
  );
}

/** Round icon-only button, e.g. in headers. 44px target. */
export function IconButton({ t, icon, onPress, label, color, bg }: { t: Theme; icon: IconName; onPress: () => void; label: string; color?: string; bg?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={6} onPress={() => { haptic.tap(); onPress(); }}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: bg ?? (pressed ? t.surface2 : "transparent") })}>
      <Ionicons name={icon} size={22} color={color ?? t.text} />
    </Pressable>
  );
}

/* ---------- Inputs ---------- */
export function Field({ t, label, error, icon, prefix, ...props }: { t: Theme; label: string; error?: string | null; icon?: IconName; prefix?: string } & TextInputProps) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: t.text, fontWeight: "600", fontSize: 14 }}>{label}</Text>
      <View style={{
        flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, borderWidth: focus ? 2 : 1, paddingHorizontal: focus ? 13 : 14,
        borderColor: error ? t.danger : focus ? t.primary : t.border, borderRadius: 14, backgroundColor: t.surface,
      }}>
        {icon && <Ionicons name={icon} size={20} color={t.muted} />}
        {prefix && <Text style={{ color: t.text, fontSize: 16, fontWeight: "600" }}>{prefix}</Text>}
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={t.muted}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={[{ flex: 1, color: t.text, fontSize: 16, paddingVertical: 12 }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]}
          {...props}
        />
      </View>
      {error ? <Text style={{ color: t.danger, fontSize: 13 }}>{error}</Text> : null}
    </View>
  );
}

/** Two or three options side by side, like iOS's segmented control. */
export function Segmented<T extends string>({ t, value, options, onChange }: { t: Theme; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", backgroundColor: t.surface2, borderRadius: 12, padding: 4 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => { haptic.tap(); onChange(o.value); }}
            style={[{ flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: on ? t.surface : "transparent" }, on ? t.shadow : null]}>
            <Text style={{ color: on ? t.text : t.muted, fontWeight: "700" }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Selectable pill (filters, categories, ID type). */
export function Chip({ t, label, on, onPress, disabled, accent }: { t: Theme; label: string; on: boolean; onPress: () => void; disabled?: boolean; accent?: "home" | "primary" }) {
  const bg = accent === "home" ? t.home : t.primary;
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled }} disabled={disabled} onPress={() => { haptic.tap(); onPress(); }}
      style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: "center", borderRadius: 999, borderWidth: 1, borderColor: on ? bg : t.border, backgroundColor: on ? bg : t.surface, opacity: disabled ? 0.4 : 1 }}>
      <Text style={{ color: on ? (accent === "home" ? t.onHome : "#fff") : t.text, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

/** "ADD" that becomes "− 1 +", like food and home-services apps. */
export function Stepper({ t, qty, max, onChange }: { t: Theme; qty: number; max: number; onChange: (q: number) => void }) {
  const base: ViewStyle = { height: 40, minWidth: 96, borderRadius: 10, borderWidth: 1, borderColor: t.primary, backgroundColor: t.surface, ...t.shadow };
  if (qty === 0) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="Add" onPress={() => { haptic.impact(); onChange(1); }} style={({ pressed }) => [base, { alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 }]}>
        <Text style={{ color: t.primary, fontWeight: "800", letterSpacing: 0.5 }}>ADD</Text>
      </Pressable>
    );
  }
  const btn = (icon: IconName, label: string, next: number, disabled = false) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} hitSlop={4} onPress={() => { haptic.tap(); onChange(next); }}
      style={{ width: 36, height: 38, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : 1 }}>
      <Ionicons name={icon} size={18} color="#fff" />
    </Pressable>
  );
  return (
    <View style={[base, { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: t.primary }]}>
      {btn("remove", "Remove one", qty - 1)}
      <Text style={{ color: "#fff", fontWeight: "800", minWidth: 16, textAlign: "center" }}>{qty}</Text>
      {btn("add", "Add one", qty + 1, qty >= max)}
    </View>
  );
}

/* ---------- Surfaces ---------- */
export function Card({ t, children, onPress, style, selected }: { t: Theme; children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; selected?: boolean }) {
  const s: StyleProp<ViewStyle> = [{
    backgroundColor: t.surface, borderRadius: 16, padding: 16, gap: 6,
    borderWidth: selected ? 2 : t.dark ? 1 : 0, borderColor: selected ? t.primary : t.border, ...t.shadow,
  }, style];
  if (!onPress) return <View style={s}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" onPress={() => { haptic.tap(); onPress(); }} style={({ pressed }) => [s, { opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }]}>
      {children}
    </Pressable>
  );
}

/** Settings-style row: icon, title, subtitle, value or chevron. */
export function ListRow({ t, icon, title, subtitle, value, onPress, danger, last }: {
  t: Theme; icon?: IconName; title: string; subtitle?: string | null; value?: string; onPress?: () => void; danger?: boolean; last?: boolean;
}) {
  const body = (pressed: boolean) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 56, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: pressed ? t.surface2 : "transparent" }}>
      {icon && (
        <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: danger ? (t.dark ? "#3B1D22" : "#FFE7E5") : t.surface2 }}>
          <Ionicons name={icon} size={19} color={danger ? t.danger : t.text} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2, borderBottomWidth: last ? 0 : 0 }}>
        <Text style={{ color: danger ? t.danger : t.text, fontSize: 16, fontWeight: "600" }}>{title}</Text>
        {subtitle ? <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={{ color: t.muted, fontSize: 14, maxWidth: "45%", textAlign: "right" }} numberOfLines={1}>{value}</Text> : null}
      {onPress && <Ionicons name="chevron-forward" size={18} color={t.muted} />}
    </View>
  );
  return (
    <View style={{ borderBottomWidth: last ? 0 : 1, borderColor: t.border, marginLeft: 0 }}>
      {onPress ? <Pressable accessibilityRole="button" onPress={() => { haptic.tap(); onPress(); }}>{({ pressed }) => body(pressed)}</Pressable> : body(false)}
    </View>
  );
}

/** A rounded group of ListRows, like iOS Settings. */
export function Group({ t, children, style }: { t: Theme; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ backgroundColor: t.surface, borderRadius: 16, overflow: "hidden", borderWidth: t.dark ? 1 : 0, borderColor: t.border, ...t.shadow }, style]}>{children}</View>;
}

export function SectionTitle({ t, title, action, onAction }: { t: Theme; title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
      <Text style={{ color: t.text, fontSize: 19, fontWeight: "800", letterSpacing: -0.3 }}>{title}</Text>
      {action && onAction && (
        <Pressable accessibilityRole="button" hitSlop={10} onPress={() => { haptic.tap(); onAction(); }}>
          <Text style={{ color: t.primary, fontWeight: "700" }}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function Pill({ t, label, color, icon }: { t: Theme; label: string; color: string; icon?: IconName }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: `${color}22` }}>
      {icon && <Ionicons name={icon} size={13} color={color} />}
      <Text style={{ color, fontWeight: "700", fontSize: 12 }}>{label}</Text>
    </View>
  );
}

export function IconTile({ t, emoji, index = 0, size = 56 }: { t: Theme; emoji: string; index?: number; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, alignItems: "center", justifyContent: "center", backgroundColor: t.tints[index % t.tints.length] }}>
      <Text style={{ fontSize: size * 0.5 }}>{emoji}</Text>
    </View>
  );
}

export function ErrorBanner({ t, message, onRetry }: { t: Theme; message: string; onRetry?: () => void }) {
  return (
    <View accessibilityRole="alert" style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, backgroundColor: t.dark ? "#3B1D22" : "#FFE7E5" }}>
      <Ionicons name="alert-circle" size={20} color={t.danger} />
      <Text style={{ color: t.text, flex: 1 }}>{message}</Text>
      {onRetry && <Pressable accessibilityRole="button" hitSlop={10} onPress={onRetry}><Text style={{ color: t.primary, fontWeight: "700" }}>Retry</Text></Pressable>}
    </View>
  );
}

export function EmptyState({ t, icon, title, body, action, onAction }: { t: Theme; icon: IconName; title: string; body?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 40, paddingHorizontal: 24, gap: 10 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: t.surface2, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={32} color={t.muted} />
      </View>
      <Text style={{ color: t.text, fontSize: 17, fontWeight: "700", textAlign: "center" }}>{title}</Text>
      {body ? <Text style={{ color: t.muted, textAlign: "center" }}>{body}</Text> : null}
      {action && onAction ? <Button t={t} size="md" variant="outline" title={action} onPress={onAction} style={{ marginTop: 6 }} /> : null}
    </View>
  );
}

/* ---------- Loading ---------- */
export function Skeleton({ t, w = "100%", h = 14, r = 8, style }: { t: Theme; w?: ViewStyle["width"]; h?: number; r?: number; style?: StyleProp<ViewStyle> }) {
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: Platform.OS !== "web" }),
    ]));
    a.start();
    return () => a.stop();
  }, [pulse]);
  return <Animated.View style={[{ width: w, height: h, borderRadius: r, backgroundColor: t.dark ? "#2C2650" : "#E7E4F1", opacity: pulse }, style]} />;
}

export function SkeletonCard({ t, lines = 3 }: { t: Theme; lines?: number }) {
  return (
    <Card t={t} style={{ gap: 10 }}>
      <Skeleton t={t} w="55%" h={16} />
      {Array.from({ length: lines - 1 }, (_, i) => <Skeleton key={i} t={t} w={i % 2 ? "70%" : "90%"} />)}
    </Card>
  );
}

export const Loading = () => <ActivityIndicator style={{ marginTop: 48 }} />;

/* ---------- Bars and sheets ---------- */
/** Bar pinned to the bottom of a screen, above the home indicator. */
export function StickyFooter({ t, children, tabBar }: { t: Theme; children: ReactNode; tabBar?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{
      paddingHorizontal: 16, paddingTop: 12, paddingBottom: tabBar ? 12 : Math.max(insets.bottom, 12),
      backgroundColor: t.surface, borderTopWidth: 1, borderColor: t.border,
    }}>
      {children}
    </View>
  );
}

/** A bottom sheet: slides up over a dimmed screen, closes on backdrop tap or Android back. */
export function Sheet({ t, visible, onClose, title, children }: { t: Theme; visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(anim, { toValue: visible ? 1 : 0, duration: visible ? 260 : 200, useNativeDriver: Platform.OS !== "web" })
      .start(() => { if (!visible) setMounted(false); });
  }, [visible, anim]);
  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
        <Animated.View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(15,11,36,0.55)", opacity: anim }}>
          <Pressable accessibilityLabel="Close" style={{ flex: 1 }} onPress={onClose} />
        </Animated.View>
        <Animated.View style={{
          backgroundColor: t.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "88%",
          paddingBottom: Math.max(insets.bottom, 16),
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [600, 0] }) }],
        }}>
          <View style={{ alignItems: "center", paddingTop: 10 }}>
            <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: t.border }} />
          </View>
          {title && (
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 }}>
              <Text style={{ color: t.text, fontSize: 19, fontWeight: "800", flex: 1 }}>{title}</Text>
              <IconButton t={t} icon="close" label="Close" onPress={onClose} bg={t.surface2} />
            </View>
          )}
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Yes/no question as a bottom sheet (works the same on Android, iOS and web). */
export function ConfirmSheet({ t, visible, title, body, confirm, cancel = "Not now", destructive, onConfirm, onClose }: {
  t: Theme; visible: boolean; title: string; body?: string; confirm: string; cancel?: string; destructive?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Sheet t={t} visible={visible} onClose={onClose}>
      <View style={{ padding: 20, gap: 12 }}>
        <Text style={{ color: t.text, fontSize: 20, fontWeight: "800" }}>{title}</Text>
        {body ? <Text style={{ color: t.muted, fontSize: 15 }}>{body}</Text> : null}
        <View style={{ gap: 10, marginTop: 8 }}>
          <Button t={t} variant={destructive ? "danger" : "primary"} title={confirm} onPress={() => { onClose(); onConfirm(); }} />
          <Button t={t} variant="outline" title={cancel} onPress={onClose} />
        </View>
      </View>
    </Sheet>
  );
}
