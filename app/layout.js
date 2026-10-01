import Script from 'next/script';
import '../public/css/app.css';

export const metadata = {
  title: 'Gmedic',
  description: 'Gmedic platform portal',
  icons: { icon: '/images/favicon.png' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#0b2238" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" />
      </head>
      <body>
        {children}
        {/* Defines window.G — every other /js/*.js script (core helpers, page
            scripts) depends on it, so it must run before anything else.
            beforeInteractive is only valid in the root layout, which is why
            it lives here rather than in each portal's own layout. */}
        <Script src="/js/core.js" strategy="beforeInteractive" />
      </body>
    </html>
  );
}
