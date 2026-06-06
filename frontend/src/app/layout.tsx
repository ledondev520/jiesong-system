import type { Metadata, Viewport } from "next";
import { Noto_Sans_SC, IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { LazyAIAssistantMount } from "@/components/ai/LazyAIAssistantMount";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { GlobalErrorBoundary } from "@/components/layout/GlobalErrorBoundary";
import "./globals.css";

/**
 * 中文字体：Noto Sans SC（Google Fonts 按需子集化加载）
 * fallback 链确保在字体下载完成前使用系统字体渲染，避免 FOIT
 */
const notoSansSC = Noto_Sans_SC({
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-body-sans",
  fallback: [
    "PingFang SC",
    "Hiragino Sans GB",
    "Microsoft YaHei",
    "Source Han Sans SC",
    "sans-serif",
  ],
});

/**
 * 等宽字体：IBM Plex Mono（代码、数据展示）
 */
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-ui-mono",
  fallback: [
    "SFMono-Regular",
    "Menlo",
    "Monaco",
    "Consolas",
    "monospace",
  ],
});

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
      className={`${notoSansSC.variable} ${ibmPlexMono.variable}`}
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
