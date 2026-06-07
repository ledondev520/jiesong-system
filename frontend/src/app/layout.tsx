import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import { LazyAIAssistantMount } from "@/components/ai/LazyAIAssistantMount";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { GlobalErrorBoundary } from "@/components/layout/GlobalErrorBoundary";
import "./globals.css";

export const metadata: Metadata = {
  title: "捷淞国际物流",
  description: "JIESONG",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "捷淞国际物流",
  },
};

/**
 * Viewport 配置：viewport-fit=cover 支持 iPhone 刘海与 Home Indicator 安全区域
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7faf7" },
    { media: "(prefers-color-scheme: dark)", color: "#1a2b1a" },
  ],
};

const serifFallback = {
  "--font-body-sans":
    '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Source Han Sans SC", sans-serif',
  "--font-ui-mono":
    '"SFMono-Regular", "Menlo", "Monaco", "Consolas", monospace',
  "--font-display-serif":
    '"Songti SC", "STSong", "Noto Serif CJK SC", serif',
} as React.CSSProperties;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
    >
      <body
        className="antialiased"
        style={{
          ...serifFallback,
          fontFamily: "var(--font-body-sans)",
        }}
      >
        <ThemeProvider>
          <GlobalErrorBoundary>
            {children}
            <Toaster position="top-center" />
            <LazyAIAssistantMount />
          </GlobalErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
