import './globals.css';
import Navbar from '@/components/Navbar';
import MainLayoutWrapper from '@/components/MainLayoutWrapper';
import Script from 'next/script';

export const metadata = {
  title: 'Smart Home',
  description: 'Smart Home Automation Control Panel',
  manifest: '/manifest.json',
};

export const viewport = {
  themeColor: '#060606',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&amp;family=JetBrains+Mono:wght@400;500;700&amp;display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet" />
      </head>
      <body>
        <Script src="https://unpkg.com/@dotlottie/player-component@2.7.12/dist/dotlottie-player.mjs" type="module" strategy="afterInteractive" />
        <ThemeInit />
        <Navbar />
        <MainLayoutWrapper>{children}</MainLayoutWrapper>
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
            navigator.serviceWorker.register('/sw.js');
          });
        }
      `}
    </Script>
  );
}
