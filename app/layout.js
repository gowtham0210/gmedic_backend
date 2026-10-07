import Script from 'next/script';
import { config as faConfig } from '@fortawesome/fontawesome-svg-core';
import '@fortawesome/fontawesome-svg-core/styles.css';
import '../public/css/app.css';

// Font Awesome's CSS is imported above, so stop it injecting a second copy at
// runtime (which would also flash oversized icons before hydration).
faConfig.autoAddCss = false;

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

// Applies the saved sidebar width / collapsed state before first paint, so the
// layout doesn't jump once public/js/layout.js loads. Keep in sync with layout.js.
const SIDEBAR_PREFS_SCRIPT = `try {
  var s = JSON.parse(localStorage.getItem('gmedic.sidebar') || '{}');
  if (s.width >= 220 && s.width <= 300) document.documentElement.style.setProperty('--sidebar-w-open', s.width + 'px');
  if (s.collapsed) document.documentElement.classList.add('sidebar-collapsed');
} catch (e) {}`;

export default function RootLayout({ children }) {
  return (
    // The inline script in <head> adds a class/style to <html> before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_PREFS_SCRIPT }} />
        <meta name="theme-color" content="#082238" />
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
