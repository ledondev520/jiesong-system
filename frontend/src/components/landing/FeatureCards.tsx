/**
 * Input: 无
 * Output: 三张功能卡（全程可追溯 / 权限分明 / AI 助手随页可用）
 * Pos: 落地页；每张卡的说法都对应已上线功能（合并前对照：采购收货验货与装箱来源、角色权限与财务行级权限、
 *      dashboard 布局里挂载的 AI 助手）。功能下线时同步删掉对应卡片；文案需负责人确认（提案 D3）
 */
const FEATURES = [
  {
    title: "全程可追溯",
    body: "一笔订单从采购、收货验货到装柜发运，沿同一条记录往下查。",
  },
  {
    title: "权限分明",
    body: "按角色开放功能；账簿明细与财务凭证仅财务和管理员可见。",
  },
  {
    title: "AI 助手随页可用",
    body: "在系统内随时向 AI 助手提问，辅助查询与商品归类。",
  },
] as const;

export function FeatureCards() {
  return (
    <section className="bg-background" aria-labelledby="features-heading">
      <h2 id="features-heading" className="sr-only">
        系统特点
      </h2>
      <div className="mx-auto grid max-w-[1200px] gap-6 px-4 pb-16 md:px-6 md:pb-24 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <article
            key={feature.title}
            className="rounded-xl border border-border bg-card p-6"
          >
            <h3 className="text-lg font-semibold">{feature.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {feature.body}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
