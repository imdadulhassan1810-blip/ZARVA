/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#d9e6ff",
          200: "#b3ceff",
          300: "#82adff",
          400: "#4f83ff",
          500: "#2a5cf5",
          600: "#1d43d1",
          700: "#1a35a8",
          800: "#182e85",
          900: "#182a69",
        },
      },
    },
  },
  plugins: [],
};
