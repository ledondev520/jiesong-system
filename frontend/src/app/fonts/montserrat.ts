/**
 * Input: app/fonts/Montserrat-latin-variable.woff2（自托管，OFL 1.1）
 * Output: Montserrat 的 next/font/local 实例；类名带 --font-montserrat 变量
 * Pos: 仅公开页（落地页、认证页）的拉丁字母与数字用；中文走系统字体；不在 /dashboard 表格里使用
 *
 * 只在需要它的组件里 import，Next 才会只为这些路由预加载字体文件；不走 Google CDN。
 */
import localFont from "next/font/local";

export const montserrat = localFont({
  src: "./Montserrat-latin-variable.woff2",
  variable: "--font-montserrat",
  weight: "400 700",
  display: "swap",
  fallback: ["ui-sans-serif", "-apple-system", "Segoe UI", "sans-serif"],
});
