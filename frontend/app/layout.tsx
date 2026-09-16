import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scavenger Hunt 2.0 — CodeChef",
  description: "A programming-powered campus scavenger hunt.",
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
      { url: "/logo.ico", sizes: "any" },
      { url: "/logo.png", type: "image/png" },
    ],
    shortcut: "/logo.ico",
    apple: "/logo.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className="min-h-screen bg-background text-white antialiased">
        {children}
      </body>
    </html>
  );
}
