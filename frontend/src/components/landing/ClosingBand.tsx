/**
 * Input: 无
 * Output: 朱砂色收尾带（暖白字 10.4:1）：已有账号→登录；需要开通→申请账号（/register 创建待审核账号，由管理员核准）
 * Pos: 落地页
 */
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function ClosingBand() {
  return (
    <section
      className="bg-primary text-primary-foreground"
      aria-label="登录与开通"
    >
      <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-12 md:grid-cols-2 md:px-6 md:py-16">
        <div className="flex flex-wrap items-center gap-4">
          <p className="text-lg font-semibold">已有账号？</p>
          <Button asChild variant="secondary" className="h-11 px-6">
            <Link href="/login">登录系统</Link>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <p className="text-lg font-semibold">需要开通？</p>
          <Button
            asChild
            variant="outline"
            className="h-11 border-primary-foreground/60 bg-transparent px-6 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
          >
            <Link href="/register">申请账号</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
