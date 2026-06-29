import type { Metadata } from "next";
import { Unbounded, Onest, DM_Mono } from "next/font/google";
import { SHOP } from "@/lib/business-hours";
import "./globals.css";

// cobbld "Workwear / Street" type system, loaded via next/font (self-hosted, no
// external Google Fonts request at runtime). Each exposes a CSS variable that
// globals.css maps onto --font-display / --font-body / --font-mono.
const unbounded = Unbounded({
  subsets: ["latin"],
  weight: ["400", "500", "700", "800", "900"],
  variable: "--font-unbounded",
  display: "swap",
});
const onest = Onest({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-onest",
  display: "swap",
});
const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: `Book a Service · ${SHOP.name}`,
  description:
    `Book a service appointment at ${SHOP.name} in ${SHOP.city}. Pick a time, it is claimed the instant you confirm.`,
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${unbounded.variable} ${onest.variable} ${dmMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
