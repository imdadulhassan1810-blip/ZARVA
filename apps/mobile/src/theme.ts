// Mirrors the web app's design tokens (apps/web/tailwind.config.js) — same brand/accent
// hues, kept as a flat light-mode palette here since the mobile app doesn't have a dark
// theme yet (unlike the web app).
export const colors = {
  brand: "#5b3df6",
  brandDark: "#332486",
  brandLight: "#f1efff",
  accent: "#ff6b4a",
  bg: "#f8fafc",
  card: "#ffffff",
  border: "#e2e8f0",
  text: "#0f172a",
  muted: "#64748b",
  success: "#059669",
  danger: "#dc2626",
  chip: "#f1f5f9",
};

// The two Google Fonts loaded in App.tsx via useFonts — see fonts.ts.
export const fonts = {
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemibold: "Inter_600SemiBold",
  display: "PlusJakartaSans_700Bold",
  displaySemibold: "PlusJakartaSans_600SemiBold",
};
