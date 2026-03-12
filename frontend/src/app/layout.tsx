import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { LazyAIAssistantMount } from "@/components/ai/LazyAIAssistantMount";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jiesong System",
  description: "Import/Export Management System",
};

const fontVariables = {
  "--font-body-sans": '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Source Han Sans SC", sans-serif',
  "--font-display-serif": '"Songti SC", "STSong", "Noto Serif CJK SC", serif',
  "--font-ui-mono": '"IBM Plex Mono", "SFMono-Regular", "Menlo", "Monaco", "Consolas", monospace',
} as React.CSSProperties;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className="antialiased"
        style={{
          ...fontVariables,
          fontFamily: "var(--font-body-sans)",
        }}
      >
        <ThemeProvider>
          {children}
          <Toaster position="top-center" />
          <LazyAIAssistantMount />
        </ThemeProvider>
      </body>
    </html>
  );
}
