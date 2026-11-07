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
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ||
      "https://home-automation-mauve-one.vercel.app",
  ),
  title: {
    default: "VikaTech | Smart Home Automation",
    template: "%s | VikaTech",
  },
  description:
    "VikaTech is a smart home automation platform for reliable cloud and local control of connected devices.",
  applicationName: "VikaTech",
  keywords: [
    "VikaTech",
    "smart home automation",
    "ESP32 home automation",
    "local smart home control",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "VikaTech",
    title: "VikaTech | Smart Home Automation",
    description:
      "Reliable cloud and local control for your connected home with VikaTech.",
    url: "/",
    images: [
      {
        url: "/vikatech-header-logo.png",
        width: 1200,
        height: 630,
        alt: "VikaTech smart home automation",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "VikaTech | Smart Home Automation",
    description:
      "Reliable cloud and local control for your connected home with VikaTech.",
    images: ["/vikatech-header-logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    "max-image-preview": "large",
  },
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "VikaTech",
              url:
                process.env.NEXT_PUBLIC_SITE_URL ||
                "https://home-automation-mauve-one.vercel.app",
              logo: {
                "@type": "ImageObject",
                url: `${
                  process.env.NEXT_PUBLIC_SITE_URL ||
                  "https://home-automation-mauve-one.vercel.app"
                }/vikatech-logo.png`,
              },
              description:
                "Smart home automation with reliable cloud and local device control.",
            }),
          }}
        />
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
