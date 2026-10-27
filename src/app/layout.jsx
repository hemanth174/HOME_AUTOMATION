// 'use client'
import "./globals.css";
import MainLayoutWrapper from "@/components/MainLayoutWrapper";
import PGShellScope from "@/components/PGShellScope";
import PGDrawerEnhancer from "@/components/PGDrawerEnhancer";
import MobileModalEnhancer from "@/components/MobileModalEnhancer";
import FeatureAnnouncementNotifier from "@/components/FeatureAnnouncementNotifier";
import Script from "next/script";
import { Sora, JetBrains_Mono } from "next/font/google";

const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-sora",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata = {
  title: "VikaTech",
  description: "VikaTech Automation Control Panel",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.png",
    apple: "/icon-192.png",
  },
};

export const viewport = {
  themeColor: "#060606",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sora.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
          rel="stylesheet"
        />
      </head>
      <body>
        <Script
          src="https://unpkg.com/@dotlottie/player-component@2.7.12/dist/dotlottie-player.mjs"
          type="module"
          crossOrigin="anonymous"
          strategy="beforeInteractive"
        />
        <ThemeInit />
        <PGShellScope />
        <PGDrawerEnhancer />
        <MobileModalEnhancer />
        <FeatureAnnouncementNotifier />
        <MainLayoutWrapper className="scrollbar-hidden">{children}</MainLayoutWrapper>
      </body>
    </html>
  );
}

function ThemeInit() {
  return (
    <Script id="theme-init" strategy="beforeInteractive">
      {`
        (function() {
          try {
            var theme = localStorage.getItem('theme') || 'dark';
            document.documentElement.setAttribute('data-theme', theme);
          } catch(e) {}
        })();
        if ('serviceWorker' in navigator) {
          window.addEventListener('load', function() {
            navigator.serviceWorker.register('/sw.js').catch(function() {});
          });
        }
      `}
    </Script>
  );
}
