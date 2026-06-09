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
        {/* PWA — installeerbaar op iPhone-beginscherm + notificaties */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#5b6cff" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="AI Mentor" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className="bg-surface text-[#1d1d1f] antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
