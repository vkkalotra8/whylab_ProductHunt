import type { Metadata, Viewport } from 'next';
import '@/ui/styles/tokens.css';
import '@/ui/styles/dark-grid.css';
import '@/ui/styles/components.css';
import Header from '@/ui/components/shell/header';
import Footer from '@/ui/components/shell/footer';
import { ThemeProvider } from '@/ui/context/theme-context';

export const metadata: Metadata = {
  title: 'WhyLab 2.0 — Machine Learning Reliability & Failure Investigation',
  description:
    'Investigate why your ML model fails in production, prove root cause with deterministic falsification experiments, and repair the operating policy with before/after measurements.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-dark-grid" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('whylab-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}else if(window.matchMedia('(prefers-color-scheme: light)').matches){document.documentElement.setAttribute('data-theme','light');}else{document.documentElement.setAttribute('data-theme','dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="app-shell">
        <ThemeProvider>
          <a href="#main-content" className="skip-to-content">
            Skip to main content
          </a>
          <Header />
          <main id="main-content" className="main-content" role="main">
            {children}
          </main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
