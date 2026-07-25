import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#059669" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export const metadata: Metadata = {
  title: {
    default: "EGX Portfolio Tracker — Egyptian Stock & Gold Portfolio Platform",
    template: "%s | EGX Portfolio Tracker",
  },
  description:
    "Track your Egyptian Exchange (EGX) stock portfolio with real-time market data, gold prices in EGP, USD/EGP forex rates, technical analysis, and performance analytics. Free portfolio management for Egyptian investors.",
  keywords: [
    "EGX", "Egyptian stock market", "Egypt stock portfolio", "EGX30",
    "gold price Egypt", "gold EGP", "USD EGP", "Egyptian exchange",
    "portfolio tracker", "stock tracker", "EGX stocks", "Egypt investments",
    "gold 24K EGP", "gold 21K EGP", "Egyptian forex", "Cairo stock exchange",
    "تتبع الأسهم المصرية", "البورصة المصرية", "سعر الذهب مصر",
  ],
  authors: [{ name: "EGX Portfolio Tracker" }],
  creator: "EGX Portfolio Tracker",
  publisher: "EGX Portfolio Tracker",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    alternateLocale: "ar_EG",
    url: "https://zizsaherstock.vercel.app",
    siteName: "EGX Portfolio Tracker",
    title: "EGX Portfolio Tracker — Egyptian Stock & Gold Platform",
    description:
      "Real-time EGX stock tracking, gold prices in EGP, USD/EGP rates, technical analysis, and portfolio management for Egyptian investors.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "EGX Portfolio Tracker",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "EGX Portfolio Tracker — Egyptian Stock & Gold Platform",
    description:
      "Real-time EGX stock tracking, gold prices in EGP, USD/EGP rates, and portfolio management.",
    images: ["/og-image.png"],
    creator: "@egxportfolio",
  },
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  metadataBase: new URL("https://zizsaherstock.vercel.app"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "EGX Portfolio Tracker",
    description: "Egyptian Stock & Gold Portfolio Tracking Platform with real-time market data",
    url: "https://zizsaherstock.vercel.app",
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: [
      "Real-time EGX stock tracking",
      "Gold prices in EGP (24K, 21K, 18K)",
      "USD/EGP forex rate tracking",
      "Portfolio performance analytics",
      "Technical analysis (S/R, RSI, MACD, Moving Averages)",
      "Market status indicators",
    ],
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
        suppressHydrationWarning
      >
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
        <Toaster richColors position="bottom-right" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
