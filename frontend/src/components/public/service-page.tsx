import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowUpRight,
  BadgeCheck,
  CircleCheckBig,
  Clock3,
  FileCheck2,
  ShieldCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Metric = {
  label: string;
  value: string;
  detail: string;
};

type Highlight = {
  title: string;
  description: string;
};

type TimelineStep = {
  name: string;
  duration: string;
  description: string;
};

type DocumentGroup = {
  title: string;
  items: string[];
};

type Faq = {
  question: string;
  answer: string;
};

type Cta = {
  label: string;
  href: string;
};

export type ServicePageConfig = {
  eyebrow: string;
  title: string;
  description: string;
  themeClassName?: string;
  metrics: Metric[];
  highlights: Highlight[];
  timeline: TimelineStep[];
  documentGroups: DocumentGroup[];
  faqs: Faq[];
  primaryCta: Cta;
  secondaryCta: Cta;
  aside?: ReactNode;
};

const sectionTitleClassName = 'text-brand-emphasis text-2xl sm:text-3xl';

export function ServicePage({ config }: { config: ServicePageConfig }) {
  return (
    <main className="relative overflow-hidden px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <section
          className={cn(
            'surface-panel relative overflow-hidden rounded-[2rem] border border-border/70 px-6 py-8 sm:px-8 lg:px-10 lg:py-10',
            'bg-[linear-gradient(135deg,oklch(1_0_0_/_0.9),oklch(0.97_0.006_252_/_0.8))] dark:bg-[linear-gradient(135deg,oklch(0.22_0.014_262_/_0.96),oklch(0.18_0.012_265_/_0.96))]',
            config.themeClassName
          )}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,oklch(0.74_0.09_252_/_0.18),transparent_35%),radial-gradient(circle_at_85%_18%,oklch(0.8_0.09_74_/_0.18),transparent_32%)]" />
          <div className="relative grid gap-8 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
            <div className="space-y-5">
              <Badge
                variant="outline"
                className="rounded-full border-brand-emphasis/30 bg-background/65 px-3 py-1 text-[11px] tracking-[0.18em] uppercase"
              >
                {config.eyebrow}
              </Badge>
              <div className="space-y-4">
                <h1 className="max-w-3xl text-4xl leading-tight sm:text-5xl">
                  {config.title}
                </h1>
                <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                  {config.description}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg" className="rounded-full px-6">
                  <Link href={config.primaryCta.href}>
                    {config.primaryCta.label}
                    <ArrowUpRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="rounded-full px-6">
                  <Link href={config.secondaryCta.href}>{config.secondaryCta.label}</Link>
                </Button>
              </div>
            </div>

            <Card className="surface-panel border-primary/20 bg-background/70">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                  <ShieldCheck className="size-5 text-brand-emphasis" />
                  交付承诺
                </div>
                <CardDescription>围绕跨境财务资料处理的关键节点建立统一节拍。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {config.metrics.map((metric) => (
                    <div
                      key={metric.label}
                      className="rounded-2xl border border-border/70 bg-card/80 p-4"
                    >
                      <p className="text-sm text-muted-foreground">{metric.label}</p>
                      <p className="mt-2 text-2xl font-semibold">{metric.value}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p>
                    </div>
                  ))}
                </div>
                {config.aside ? (
                  <div className="rounded-2xl border border-dashed border-border/80 bg-background/60 p-4">
                    {config.aside}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <Card className="surface-panel border-primary/20 lg:col-span-3">
            <CardHeader>
              <h2 className={sectionTitleClassName}>服务亮点</h2>
              <CardDescription>把资料校核、提交节奏和窗口协同拆成可执行动作。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              {config.highlights.map((highlight, index) => (
                <article
                  key={highlight.title}
                  className="rounded-2xl border border-border/70 bg-background/55 p-5"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <Badge variant="secondary" className="rounded-full px-2.5 py-1">
                      0{index + 1}
                    </Badge>
                    <BadgeCheck className="size-5 text-brand-emphasis" />
                  </div>
                  <h3 className="text-xl">{highlight.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {highlight.description}
                  </p>
                </article>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="surface-panel border-primary/20">
            <CardHeader>
              <h2 className={sectionTitleClassName}>办理流程</h2>
              <CardDescription>每个阶段都给出明确输出，避免等待到最后一刻才补材料。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {config.timeline.map((step, index) => (
                <div
                  key={step.name}
                  className="grid gap-3 rounded-2xl border border-border/70 bg-background/55 p-4 sm:grid-cols-[auto_1fr_auto] sm:items-start"
                >
                  <div className="flex size-9 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-brand-emphasis">
                    {index + 1}
                  </div>
                  <div>
                    <h3 className="text-lg">{step.name}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                  <Badge variant="outline" className="h-fit rounded-full px-3 py-1">
                    <Clock3 className="size-3.5" />
                    {step.duration}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="surface-panel border-primary/20">
            <CardHeader>
              <h2 className={sectionTitleClassName}>资料清单</h2>
              <CardDescription>按资料组收集，能更快判断是缺口问题还是口径问题。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {config.documentGroups.map((group) => (
                <Card key={group.title} className="border-border/70 bg-background/55 py-4">
                  <CardHeader className="pb-2">
                    <h3 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                      <FileCheck2 className="size-4.5 text-brand-emphasis" />
                      {group.title}
                    </h3>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      {group.items.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <CircleCheckBig className="mt-0.5 size-4 shrink-0 text-brand-emphasis-soft" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="surface-panel border-primary/20">
            <CardHeader>
              <h2 className={sectionTitleClassName}>常见问题</h2>
              <CardDescription>把最常见的时间、材料与协同问题先讲清楚。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {config.faqs.map((faq) => (
                <article
                  key={faq.question}
                  className="rounded-2xl border border-border/70 bg-background/55 p-5"
                >
                  <h3 className="text-lg">{faq.question}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{faq.answer}</p>
                </article>
              ))}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
