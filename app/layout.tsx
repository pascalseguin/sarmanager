import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { SettingsProvider } from "@/lib/settings-context";
import NavBar from "@/components/NavBar";

export const metadata: Metadata = {
  title: "SAR Manager",
  description: "Unified interface for SAR operations",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico' },
    ],
    apple: '/favicon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ height: '100%' }}>
      <body style={{ height: '100%', margin: 0 }}>
        <SettingsProvider>
          <AuthProvider>
            <NavBar />
            {children}
          </AuthProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
