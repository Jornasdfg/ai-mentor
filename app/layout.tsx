import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Mentor",
  description: "Persoonlijke AI Mentor — dagelijkse prioritering op basis van je werkgeheugen",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body className="bg-surface text-[#1d1d1f] antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
