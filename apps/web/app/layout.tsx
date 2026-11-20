import type { Metadata, Viewport } from "next";
import { Header } from "../components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZARVA",
  description: "Har Zaroorat Ek Thikana. Everyday services in one app.",
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/favicon.ico" }, { url: "/favicon-32.png", sizes: "32x32" }], apple: "/apple-touch-icon-180.png" },
};
export const viewport: Viewport = { themeColor: "#0F0B24", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
      </head>
      <body>
        <Header />
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
