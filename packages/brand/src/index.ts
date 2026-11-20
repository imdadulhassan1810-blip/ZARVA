/**
 * ZARVA design tokens. Single source of truth for web (CSS variables) and mobile (RN StyleSheet).
 * Colours come from the ZARVA logo kit README. Do not recolour the logo itself.
 */

export const ink = "#0F0B24";
export const paper = "#F6F5FB";

export const neutral = {
  ink,
  paper,
  white: "#FFFFFF",
  captionOnLight: "#4A4566",
  captionOnDark: "#B9B4D6",
  border: "#E3E1EE",
  muted: "#6E6A85",
  surfaceDark: "#1A1535",
} as const;

export const feedback = {
  success: "#139E66",
  warning: "#F09A12",
  danger: "#E8475A",
  info: "#2F5FE0",
} as const;

/** One entry per vertical. id matches the module id used by the API module registry. */
export const verticals = {
  food: { label: "Food", from: "#FF7A6B", to: "#E8475A", flat: "#F15A5F" },
  shopping: { label: "Shopping", from: "#3FD08F", to: "#139E66", flat: "#22B579" },
  events: { label: "Events", from: "#9D82FF", to: "#FF6F91", flat: "#B47BEF" },
  travel: { label: "Travel & rides", from: "#5B92FF", to: "#2F5FE0", flat: "#4377F0" },
  home: { label: "Home services", from: "#FFC54D", to: "#F09A12", flat: "#F8B030" },
} as const;

export type VerticalId = keyof typeof verticals;
export const verticalIds = Object.keys(verticals) as VerticalId[];

/** Brand primary for generic actions: the hero diagonal (events gradient). */
export const primary = { from: "#9D82FF", to: "#FF6F91", flat: "#7C5CF0", onPrimary: "#FFFFFF" } as const;

export const font = {
  family: "Inter",
  fallback: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  weight: { regular: "400", medium: "500", semibold: "600", bold: "700" },
} as const;

/** 4pt spacing scale. */
export const space = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const fontSize = { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, "2xl": 28, "3xl": 36 } as const;

/** Logo usage rules from the kit, enforced in code where possible. */
export const logoRules = {
  minMarkPx: 24,
  minHorizontalLockupPx: 120,
  minCaptionLockupPx: 200,
  /** Below this size use the *-flat SVGs. */
  flatBelowPx: 48,
  tagline: "Har Zaroorat Ek Thikana",
} as const;

export function gradient(id: VerticalId, angleDeg = 135): string {
  const v = verticals[id];
  return `linear-gradient(${angleDeg}deg, ${v.from}, ${v.to})`;
}

/** Pick the right mark file for a rendered size, following the kit's flat-below-48px rule. */
export function markFileForSize(px: number): "zarva-mark-flat.svg" | "zarva-mark-color.svg" {
  if (px < logoRules.minMarkPx) throw new Error(`ZARVA mark must be at least ${logoRules.minMarkPx}px`);
  return px < logoRules.flatBelowPx ? "zarva-mark-flat.svg" : "zarva-mark-color.svg";
}
