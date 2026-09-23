import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { Sprout, ShoppingBag, LayoutDashboard } from "lucide-react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Farm Fresh Direct | Local Agricultural Marketplace",
  description: "Connect local growers and buyers for fresh farm produce.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-emerald-50/30 text-gray-900 min-h-screen flex flex-col`}
      >
        {/* SHARED TOP NAVIGATION */}
        <header className="bg-white/90 backdrop-blur-md border-b border-emerald-100 sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link href="/browse" className="flex items-center gap-2.5 font-black text-xl text-emerald-900">
              <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-sm">
                <Sprout className="w-5 h-5" />
              </div>
              <span>Farm Fresh <span className="text-emerald-600 font-medium">Direct</span></span>
            </Link>

            <nav className="flex items-center gap-3">
              <Link
                href="/browse"
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-emerald-50 hover:text-emerald-800 transition-colors"
              >
                <ShoppingBag className="w-4 h-4" /> Browse
              </Link>
              <Link
                href="/dashboard"
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-colors"
              >
                <LayoutDashboard className="w-4 h-4" /> Seller Dashboard
              </Link>
            </nav>
          </div>
        </header>

        {/* MAIN BODY WRAPPER */}
        <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6">
          {children}
        </main>
      </body>
    </html>
  );
}