import type { Metadata } from "next";
import { IBM_Plex_Mono, Noto_Sans_SC, Noto_Serif_SC } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { AIAssistant } from "@/components/ai/AIAssistant";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import "./globals.css";

const bodySans = Noto_Sans_SC({
  variable: "--font-body-sans",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
});

const displaySerif = Noto_Serif_SC({
  variable: "--font-display-serif",
  weight: ["500", "700"],
  subsets: ["latin"],
});

const uiMono = IBM_Plex_Mono({
  variable: "--font-ui-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Jiesong System",
  description: "Import/Export Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${bodySans.variable} ${displaySerif.variable} ${uiMono.variable} antialiased`}
        style={{
          fontFamily: "var(--font-body-sans)",
        }}
      >
        <ThemeProvider>
          {children}
          <Toaster position="top-center" />
          <AIAssistant />
        </ThemeProvider>
      </body>
    </html>
  );
}
