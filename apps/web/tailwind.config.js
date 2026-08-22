/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["InterVariable", "Inter", "system-ui", "sans-serif"],
        display: ["Plus Jakarta Sans Variable", "Plus Jakarta Sans", "system-ui", "sans-serif"],
      },
      colors: {
        // Primary brand — vivid indigo-violet. One value set works across both themes;
        // dark-mode contrast is handled by what it's placed on, not by re-tinting the ramp.
        brand: {
          50: "#f1efff",
          100: "#e4e0ff",
          200: "#c9c1ff",
          300: "#a89bff",
          400: "#8b78ff",
          500: "#6d54fb",
          600: "#5b3df6",
          700: "#4a2fd1",
          800: "#3d28a8",
          900: "#332486",
        },
        // Accent — warm coral, used sparingly (logo, hero, highlights) against the violet primary.
        accent: {
          50: "#fff1ed",
          100: "#ffe1d6",
          200: "#ffc0ab",
          300: "#ff9a7a",
          400: "#ff7a55",
          500: "#ff6b4a",
          600: "#f14e2c",
          700: "#c93c1f",
          800: "#a3321c",
          900: "#862c1c",
        },
        // Card/page surfaces — deliberately NOT the "white" token itself, since text-white
        // (button labels on brand-colored buttons) must always stay literal white in both
        // themes. bg-white is swapped for bg-surface across the app instead (see below).
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          raised: "rgb(var(--surface-raised) / <alpha-value>)",
        },
        // "slate" is overridden (not merely extended) so every existing text-slate-*/
        // border-slate-*/bg-slate-* utility in the app flips automatically under the
        // .dark class, without touching each page individually.
        slate: {
          50: "rgb(var(--slate-50) / <alpha-value>)",
          100: "rgb(var(--slate-100) / <alpha-value>)",
          200: "rgb(var(--slate-200) / <alpha-value>)",
          300: "rgb(var(--slate-300) / <alpha-value>)",
          400: "rgb(var(--slate-400) / <alpha-value>)",
          500: "rgb(var(--slate-500) / <alpha-value>)",
          600: "rgb(var(--slate-600) / <alpha-value>)",
          700: "rgb(var(--slate-700) / <alpha-value>)",
          800: "rgb(var(--slate-800) / <alpha-value>)",
          900: "rgb(var(--slate-900) / <alpha-value>)",
        },
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)",
        "card-hover": "0 4px 12px -2px rgb(15 23 42 / 0.08), 0 2px 6px -2px rgb(15 23 42 / 0.06)",
        popover: "0 8px 24px -4px rgb(15 23 42 / 0.12), 0 4px 10px -4px rgb(15 23 42 / 0.08)",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
      },
    },
  },
  plugins: [],
};
