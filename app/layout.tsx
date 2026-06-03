import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { SettingsProvider } from "@/lib/settings-context";
import Link from "next/link";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SAR Manager",
  description: "Unified interface for SAR operations",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SettingsProvider>
          <AuthProvider>
            <nav className="bg-gray-800 text-white px-6 py-3 flex items-center gap-6">
              <Link href="/" className="font-semibold hover:text-gray-300">SAR Manager</Link>
              <Link href="/operations" className="text-sm text-gray-300 hover:text-white">Operations</Link>
              <Link href="/equipment" className="text-sm text-gray-300 hover:text-white">Equipment</Link>
              <Link href="/settings" className="text-sm text-gray-300 hover:text-white">Settings</Link>
              <Link href="/logs" className="text-sm text-gray-400 hover:text-white ml-auto">Logs</Link>
            </nav>
            {children}
          </AuthProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
