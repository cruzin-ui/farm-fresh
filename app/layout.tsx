import type { Metadata, Viewport } from "next";
import BottomNav from "@/components/BottomNav";
import AccountMenu from "@/components/AccountMenu";
import { DM_Sans, Fraunces } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { Sprout, ShoppingBag, LayoutDashboard, Receipt } from "lucide-react";

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
    default: "Farm Fresh Direct | Local Agricultural Marketplace",
    template: "%s | Farm Fresh Direct",
  },
  description: "Connect local growers and buyers for fresh farm produce.",
};

// viewportFit "cover" lets the bottom tab bar pad itself clear of the iPhone
// home indicator.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#059669",
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
            <Link href="/" className="font-heading flex items-center gap-2.5 font-black text-xl text-emerald-900">
              <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-sm">
                <Sprout className="w-5 h-5" />
              </div>
              <span>Farm Fresh <span className="text-emerald-600 font-medium">Direct</span></span>
            </Link>

            <div className="flex items-center gap-3">
            {/* On phones these links live in the bottom tab bar instead. */}
            <nav className="hidden md:flex items-center gap-3">
              <Link
                href="/browse"
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-emerald-50 hover:text-emerald-800 transition-colors"
              >
                <ShoppingBag className="w-4 h-4" /> Browse
              </Link>
              <Link
                href="/orders"
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-emerald-50 hover:text-emerald-800 transition-colors"
              >
                <Receipt className="w-4 h-4" /> My Orders
              </Link>
              <Link
                href="/dashboard"
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-colors"
              >
                <LayoutDashboard className="w-4 h-4" /> Seller Dashboard
              </Link>
            </nav>
            <AccountMenu />
            </div>
          </div>
        </header>

        {/* MAIN BODY WRAPPER */}
        <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6">
          {children}
        </main>

        {/* Extra bottom padding on phones keeps the footer clear of the tab bar. */}
        <footer className="print:hidden w-full max-w-7xl mx-auto px-4 pt-4 pb-24 md:pb-6 text-xs text-gray-500 flex items-center justify-center gap-4">
          <Link href="/faq" className="font-semibold hover:text-emerald-700 hover:underline">
            FAQ
          </Link>
          <Link href="/contact" className="font-semibold hover:text-emerald-700 hover:underline">
            Contact Us
          </Link>
          <Link href="/about" className="font-semibold hover:text-emerald-700 hover:underline">
            About
          </Link>
        </footer>

        <BottomNav />
      </body>
    </html>
  );
}