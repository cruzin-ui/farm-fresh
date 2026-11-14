import type { Metadata, Viewport } from "next";
import BottomNav from "@/components/BottomNav";
import CartButton from '@/components/CartButton';
import AccountMenu from "@/components/AccountMenu";
import SellerDashboardLink from "@/components/SellerDashboardLink";
import { Patua_One } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import PageViewCounter from "@/components/PageViewCounter";
import NativeApp from "@/components/NativeApp";
import { ShoppingBag } from "lucide-react";
import FfdLogo from "@/components/FfdLogo";
import SeasonIcon from "@/components/SeasonIcon";
import { SEASON_SCRIPT } from "@/lib/season";

// Body text: Patua One, a sturdy slab serif with a farm-stand feel.
// Headings, titles and the site name: FFD Display, which is Fugaz One (bold
// and slanted) with a plainer lowercase f (see app/fonts/README.md). Each comes
// in one weight only. Both are applied in globals.css.
const bodyFont = Patua_One({
  variable: "--font-body",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const headingFont = localFont({
  src: "./fonts/ffd-display.ttf",
  variable: "--font-heading",
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Farm Fresh Direct | Your Online Farm Stand",
    template: "%s | Farm Fresh Direct",
  },
  description: "Local produce, plants, and more from growers near you.",
  // The image and text shown when a link to the site is shared by text
  // message or on social media.
  metadataBase: new URL("https://www.farmfreshdirect.online"),
  openGraph: {
    title: "Farm Fresh Direct — Your Online Farm Stand",
    description: "Buy local produce, plants and more directly from neighbor gardens and small farms.",
    siteName: "Farm Fresh Direct",
    type: "website",
    images: [{ url: "/share-preview.jpg", width: 1200, height: 630, alt: "Crates of fresh fruit and vegetables at a market stall" }],
  },
};

// viewportFit "cover" lets the bottom tab bar pad itself clear of the iPhone
// home indicator.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#047857",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The inline script sets data-season on <html> before the page is drawn,
    // which is why React is told not to expect it to match the server's copy.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SEASON_SCRIPT }} />
      </head>
      <body
        className={`${bodyFont.variable} ${headingFont.variable} antialiased bg-emerald-50/30 text-gray-900 min-h-screen flex flex-col`}
      >
        {/* SHARED TOP NAVIGATION */}
        <header className="site-header bg-white/90 backdrop-blur-md border-b border-emerald-100 sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link href="/" className="font-heading flex items-center gap-2.5 font-black text-lg sm:text-xl text-emerald-900 whitespace-nowrap">
              <div className="p-1 bg-emerald-600 rounded-xl shadow-sm">
                <FfdLogo className="w-7 h-7" />
              </div>
              <span>Farm <span className="text-emerald-600">Fresh</span> Direct</span>
              <SeasonIcon />
            </Link>

            <div className="flex items-center gap-1.5 md:gap-3">
            {/* Browse sits beside the account menu, with Seller Dashboard before
                it for signed-in sellers; My Purchases is inside the menu. On
                phones it is all in the menu button, with the bottom tab bar as
                a shortcut. */}
            <nav className="hidden md:flex items-center gap-3">
              <SellerDashboardLink />
              <Link
                href="/browse"
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-emerald-50 hover:text-emerald-800 transition-colors"
              >
                <ShoppingBag className="w-4 h-4" /> Browse
              </Link>
            </nav>
            <CartButton />
            <AccountMenu />
            </div>
          </div>
        </header>

        {/* MAIN BODY WRAPPER */}
        <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6">
          {children}
        </main>

        {/* Extra bottom padding on phones keeps the footer clear of the tab bar. */}
        <footer className="print:hidden w-full max-w-7xl mx-auto px-4 pt-4 pb-24 md:pb-6 text-xs text-gray-500">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <Link href="/why" className="app-hide font-semibold hover:text-emerald-700 hover:underline">
            Why Use Us
          </Link>
          <Link href="/faq" className="font-semibold hover:text-emerald-700 hover:underline">
            FAQ
          </Link>
          <Link href="/contact" className="font-semibold hover:text-emerald-700 hover:underline">
            Contact Us
          </Link>
          <Link href="/about" className="app-hide font-semibold hover:text-emerald-700 hover:underline">
            About
          </Link>
          <Link href="/terms" className="font-semibold hover:text-emerald-700 hover:underline">
            Terms of Use
          </Link>
          <Link href="/seller-terms" className="font-semibold hover:text-emerald-700 hover:underline">
            Seller Terms
          </Link>
          <Link href="/privacy" className="font-semibold hover:text-emerald-700 hover:underline">
            Privacy Policy
          </Link>
          </div>
          <p className="app-hide mt-3 text-center">
            © {new Date().getFullYear()} Farm Fresh Direct LLC. Connecting local food communities.
          </p>
        </footer>

        <BottomNav />

        {/* Counts page visits, without cookies, so we can see which pages are
            used. It does nothing until Web Analytics is switched on for the
            project in Vercel. */}
        <Analytics />

        {/* Our own count of visits and page views, shown in the admin page. */}
        <PageViewCounter />

        {/* Back button and sign-in inside the iPhone/Android app; nothing on the website. */}
        <NativeApp />
      </body>
    </html>
  );
}