import './globals.css';
import Navbar from '@/components/Navbar';
import MainLayoutWrapper from '@/components/MainLayoutWrapper';
import Script from 'next/script';
import { Sora, JetBrains_Mono } from 'next/font/google';

const sora = Sora({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-sora',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata = {
  title: 'VikaTech',
  description: 'VikaTech Automation Control Panel',
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
    <html lang="en" suppressHydrationWarning className={`${sora.variable} ${jetbrainsMono.variable}`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block" rel="stylesheet" />
      </head>
      <body>
        <Script src="https://unpkg.com/@dotlottie/player-component@2.7.12/dist/dotlottie-player.mjs" type="module" strategy="beforeInteractive" />
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
          if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            navigator.serviceWorker.getRegistrations().then(function(registrations) {
              for (var reg of registrations) {
                reg.unregister();
              }
            });
          } else {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js');
            });
          }
        }
      `}
    </Script>
  );
}
