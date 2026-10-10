import type { Metadata, Viewport } from "next";
import BottomNav from "@/components/BottomNav";
import CartButton from '@/components/CartButton';
import AccountMenu from "@/components/AccountMenu";
import { DM_Sans, Fraunces } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { Sprout, ShoppingBag } from "lucide-react";

// Body text: a clean, friendly sans-serif. Headings: a soft serif with a
// hand-made, market-stall feel. Both are applied in globals.css.
const bodyFont = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const headingFont = Fraunces({
  variable: "--font-heading",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Farm Fresh Direct | Your Online Farm Stand",
    template: "%s | Farm Fresh Direct",
  },
  description: "Connect local growers and buyers for fresh farm produce.",
  // The image and text shown when a link to the site is shared by text
  // message or on social media.
  metadataBase: new URL("https://www.farmfreshdirect.online"),
  openGraph: {
    title: "Farm Fresh Direct — Your Online Farm Stand",
    description: "Buy fresh produce directly from neighbor gardens and small local farms.",
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
    <html lang="en">
      <body
        className={`${bodyFont.variable} ${headingFont.variable} antialiased bg-emerald-50/30 text-gray-900 min-h-screen flex flex-col`}
      >
        {/* SHARED TOP NAVIGATION */}
        <header className="bg-white/90 backdrop-blur-md border-b border-emerald-100 sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link href="/" className="font-heading flex items-center gap-2.5 font-black text-lg sm:text-xl text-emerald-900 whitespace-nowrap">
              <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-sm">
                <Sprout className="w-5 h-5" />
              </div>
              <span>Farm Fresh <span className="text-emerald-600 font-medium">Direct</span></span>
            </Link>

            <div className="flex items-center gap-1.5 md:gap-3">
            {/* Browse is the one link kept beside the account menu; My Orders
                and the Seller Dashboard are inside that menu. On phones it is
                all in the menu button, with the bottom tab bar as a shortcut. */}
            <nav className="hidden md:flex items-center gap-3">
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
          <Link href="/faq" className="font-semibold hover:text-emerald-700 hover:underline">
            FAQ
          </Link>
          <Link href="/contact" className="font-semibold hover:text-emerald-700 hover:underline">
            Contact Us
          </Link>
          <Link href="/about" className="font-semibold hover:text-emerald-700 hover:underline">
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
          <p className="mt-3 text-center">
            © {new Date().getFullYear()} Farm Fresh Direct LLC. Connecting local food communities.
          </p>
        </footer>

        <BottomNav />
      </body>
    </html>
  );
}