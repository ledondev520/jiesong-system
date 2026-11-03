/**
 * Input: 无
 * Output: 浅色暖纸首屏：金色小标题、炭黑 H1（本页唯一 h1）、说明、朱砂主按钮与描边次按钮；右侧大标志（≥768px）
 * Pos: 落地页首屏；不出现客户名、数字、价格或真实界面截图
 */
import Link from "next/link";
import { BrandMark } from "@/components/brand/BrandMark";
import { Button } from "@/components/ui/button";

export function LandingHero() {
  return (
    <section className="bg-card">
      <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 py-16 md:min-h-[560px] md:grid-cols-2 md:px-6 md:py-24">
        <div>
          <p className="font-brand text-sm font-semibold tracking-[0.08em] text-brand-gold-text">
            进出口业务管理系统
          </p>
          <h1 className="font-brand mt-4 text-[32px] font-semibold leading-10 tracking-[-0.02em] text-foreground md:text-5xl md:leading-[56px]">
            <span className="inline-block">从报价到退税，</span>
            <span className="inline-block">出口业务一站走完</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-7 text-muted-foreground">
            报价、出口订单、采购、库存、装柜发运、报关单、财务、出口退税，在同一套系统里协同完成。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="h-11 px-6">
              <Link href="/login">登录系统</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-11 px-6">
              <Link href="/register">申请账号</Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            仅限捷淞员工及受邀合作方使用
          </p>
        </div>
        <div
          className="hidden items-center justify-center rounded-xl bg-secondary py-16 md:flex"
          aria-hidden="true"
        >
          <BrandMark size={280} />
        </div>
      </div>
    </section>
  );
}
