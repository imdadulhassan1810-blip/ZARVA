import { Platform, useColorScheme, type ViewStyle } from "react-native";
import { neutral, primary, radius, space, fontSize, feedback, verticals } from "@zarva/brand";

/**
 * Mobile theme built from the ZARVA brand tokens (logo kit), matching the web landing page:
 * an ink hero with a warm home-services glow, amber actions for home services, soft tinted icon tiles.
 */
export function useTheme() {
  const dark = useColorScheme() === "dark";
  return {
    dark,
    bg: dark ? neutral.ink : neutral.paper,
    surface: dark ? neutral.surfaceDark : neutral.white,
    /** Slightly raised surface: pressed rows, inputs on cards. */
    surface2: dark ? "#241E44" : "#F1EFF8",
    text: dark ? neutral.paper : neutral.ink,
    muted: dark ? neutral.captionOnDark : neutral.muted,
    border: dark ? "#2C2650" : neutral.border,
    primary: primary.flat,
    primaryFrom: primary.from,
    primaryTo: primary.to,
    /** Home services accent (the vertical live now). Text on it is dark brown, never white. */
    home: verticals.home.flat,
    homeFrom: verticals.home.from,
    homeTo: verticals.home.to,
    onHome: "#2A1A00",
    ink: neutral.ink,
    danger: feedback.danger,
    success: feedback.success,
    warning: feedback.warning,
    info: feedback.info,
    /** Soft tints for icon tiles, one per category index. */
    tints: dark
      ? ["#3A2E12", "#1B2747", "#14352A", "#3B1D22", "#2B2150"]
      : ["#FFF1D6", "#E4EEFF", "#E2F7EE", "#FFE7E5", "#F1EAFF"],
    radius,
    space,
    fontSize,
    /** Soft card shadow (iOS) / elevation (Android). Flat in dark mode, where borders do the work. */
    shadow: (dark
      ? {}
      : Platform.select<ViewStyle>({
          ios: { shadowColor: "#0F0B24", shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
          android: { elevation: 2 },
          default: { boxShadow: "0 4px 14px rgba(15,11,36,0.07)" } as ViewStyle,
        })) as ViewStyle,
  };
}
export type Theme = ReturnType<typeof useTheme>;
