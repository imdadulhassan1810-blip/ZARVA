import { ActivityIndicator, Pressable, Text, TextInput, View, type TextInputProps } from "react-native";
import { primary } from "@zarva/brand";
import type { Theme } from "./theme";

export function Button({ t, title, onPress, disabled, ghost }: { t: Theme; title: string; onPress: () => void; disabled?: boolean; ghost?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        minHeight: 48, borderRadius: t.radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: 20,
        backgroundColor: ghost ? "transparent" : primary.flat, borderWidth: ghost ? 1 : 0, borderColor: t.border,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ color: ghost ? t.text : "#fff", fontWeight: "600", fontSize: t.fontSize.md }}>{title}</Text>
    </Pressable>
  );
}

export function Field({ t, label, ...props }: { t: Theme; label: string } & TextInputProps) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: t.text, fontWeight: "500", fontSize: t.fontSize.sm }}>{label}</Text>
      <TextInput
        placeholderTextColor={t.muted}
        style={{ minHeight: 48, borderWidth: 1, borderColor: t.border, borderRadius: t.radius.md, paddingHorizontal: 14, color: t.text, backgroundColor: t.surface, fontSize: t.fontSize.md }}
        {...props}
      />
    </View>
  );
}

export const Loading = () => <ActivityIndicator style={{ marginTop: 48 }} />;
