import type { Metadata } from "next";
import { Hanken_Grotesk, Tilt_Neon } from "next/font/google";
import { site } from "@/lib/site";
import "./globals.css";

// Prices and stock come from Postgres on every request, so sold-out
// originals disappear from sale immediately.
export const dynamic = "force-dynamic";

const neon = Tilt_Neon({ subsets: ["latin"], variable: "--font-neon", display: "swap" });
const text = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-text", display: "swap" });

export const metadata: Metadata = {
  title: { default: `${site.name} | ${site.tagline}`, template: `%s | ${site.name}` },
  description: site.statement,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${neon.variable} ${text.variable}`}>
      <body>{children}</body>
    </html>
  );
}
