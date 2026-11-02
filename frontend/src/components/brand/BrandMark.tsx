/**
 * Input: 尺寸（px）
 * Output: 《向阳逐浪》标志（B25 矢量）；浅色用炭黑+标记红节点，深色用反白稿
 * Pos: 公开页与认证页的品牌标识；装饰性图片（旁边总有文字名称），不进入 /dashboard
 *
 * 标志 ≥32px 才清晰（docs/brand/BRAND-ASSETS.md 小尺寸验证），调用方不要小于 32。
 */
/* eslint-disable @next/next/no-img-element -- 本地静态 SVG，不需要 next/image 的优化 */

export function BrandMark({
  size = 32,
  className = "",
}: Readonly<{ size?: number; className?: string }>) {
  return (
    <span className={`inline-flex shrink-0 ${className}`} aria-hidden="true">
      <img
        src="/brand/xiangyang-mark-color.svg"
        alt=""
        width={size}
        height={size}
        className="dark:hidden"
      />
      <img
        src="/brand/xiangyang-mark-white.svg"
        alt=""
        width={size}
        height={size}
        className="hidden dark:block"
      />
    </span>
  );
}
