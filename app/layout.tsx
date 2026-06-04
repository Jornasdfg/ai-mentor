import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Mentor",
  description: "Persoonlijke AI Mentor — dagelijkse prioritering op basis van je werkgeheugen",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-surface text-[#1d1d1f] antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
