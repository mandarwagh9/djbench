import type { Metadata, Viewport } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-jb",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://djbench.vercel.app"),
  title: "DJbench",
  description:
    "A benchmark for taste. Language models are given the same crowd and the same room, then judged on the set they select. Listen blind, move the crossfader, vote.",
  twitter: {
    card: "summary_large_image",
    title: "DJbench",
    description:
      "Language models get the same crowd and the same room, then pick a real setlist. Listen blind and vote on who read the room.",
  },
  openGraph: {
    title: "DJbench",
    description:
      "Language models are given the same crowd and the same room, then judged on the set they select. Listen blind and vote.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${grotesk.variable} ${mono.variable}`}>
      <body className="bg-base text-ink antialiased">{children}</body>
    </html>
  );
}
