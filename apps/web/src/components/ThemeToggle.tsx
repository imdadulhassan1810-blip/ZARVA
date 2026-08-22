import { useState } from "react";
import { getTheme, toggleTheme } from "../lib/theme";

export function ThemeToggle() {
  const [theme, setThemeState] = useState(getTheme);

  return (
    <button
      type="button"
      onClick={() => setThemeState(toggleTheme())}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-white/10 transition"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
