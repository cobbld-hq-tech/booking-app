import type { Metadata } from "next";
import { Space_Grotesk, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { SHOP } from "@/lib/business-hours";
import "./globals.css";

// "Clean" type system, loaded via next/font (self-hosted, no external Google
// Fonts request at runtime). Each exposes a CSS variable that globals.css maps
// onto --font-display / --font-body / --font-mono.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hanken",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: `Book a Service · ${SHOP.name}`,
  description:
    `Book a service appointment at ${SHOP.name} in ${SHOP.city}. Pick a time, it is claimed the instant you confirm.`,
  icons: { icon: "/favicon.svg" },
};

// Inline, render-blocking in <head> so a saved dark-mode preference is applied
// before first paint (no flash of light). Default is the Clean light theme; only
// an explicit "dark" choice (set by ThemeToggle) opts in.
const themeScript = `(function(){try{if(localStorage.getItem('pmw-theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${hanken.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
