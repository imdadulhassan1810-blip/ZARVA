import { useColorScheme } from "react-native";
import { neutral, primary, radius, space, fontSize, feedback } from "@zarva/brand";

export function useTheme() {
  const dark = useColorScheme() === "dark";
  return {
    dark,
    bg: dark ? neutral.ink : neutral.paper,
    surface: dark ? neutral.surfaceDark : neutral.white,
    text: dark ? neutral.paper : neutral.ink,
    muted: dark ? neutral.captionOnDark : neutral.muted,
    border: dark ? "#2C2650" : neutral.border,
    primary: primary.flat,
    danger: feedback.danger,
    radius,
    space,
    fontSize,
  };
}
export type Theme = ReturnType<typeof useTheme>;
