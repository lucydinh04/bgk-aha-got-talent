import type { Metadata, Viewport } from "next";
import { Lexend, Archivo } from "next/font/google";
import "./globals.css";

/** Lexend cho nội dung — theo design system §32 của brief. */
const lexend = Lexend({
  variable: "--font-lexend",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

/** Display condensed mạnh cho headline và điểm số. */
const archivo = Archivo({
  variable: "--font-display",
  subsets: ["latin", "vietnamese"],
  weight: ["700", "800", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Aha Got Talent 2026 — Hệ thống chấm điểm",
  description:
    "Sinh nhật Ahamove 11 tuổi · Chuyển mình bứt phá · Unlock Your Next Move",
};

export const viewport: Viewport = {
  themeColor: "#040914",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${lexend.variable} ${archivo.variable} h-full antialiased`}
      style={{ fontFamily: "var(--font-lexend)" }}
    >
      <body className="bg-ink text-chalk flex min-h-full flex-col">
        {children}
      </body>
    </html>
  );
}
