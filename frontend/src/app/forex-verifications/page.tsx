import type { Metadata } from 'next';
import { ServicePage, type ServicePageConfig } from '@/components/public/service-page';

export const metadata: Metadata = {
  title: '外汇核销服务 | Jiesong System',
  description: '面向出口业务的外汇核销预审、资料整理与节奏跟进页面。',
};

const forexVerificationConfig: ServicePageConfig = {
  eyebrow: 'Public Service / Forex Verification',
  title: '外汇核销加速通道',
  description:
    '围绕收汇匹配、报关单据核验和异常节点跟催，先把核销材料按窗口顺序整理清楚，再进入正式办理，减少银行与单证往返次数。',
  themeClassName:
    'before:absolute before:inset-y-0 before:right-0 before:w-1/3 before:bg-[linear-gradient(180deg,oklch(0.8_0.09_74_/_0.06),transparent)]',
  metrics: [
    { label: '平均预审响应', value: '24h', detail: '工作日内反馈缺口' },
    { label: '收汇匹配节点', value: '4步', detail: '从水单到核销闭环' },
    { label: '重点单据校验', value: '9类', detail: '覆盖核销常见材料' },
    { label: '异常回退率', value: '<5%', detail: '资料齐全项目目标值' },
  ],
  highlights: [
    {
      title: '收汇核对',
      description: '银行回单与报关单交叉校验',
    },
    {
      title: '异常归因',
      description: '把到账延迟、币种差异、单证缺项拆开处理，避免一次性混在一起返工。',
    },
    {
      title: '窗口协同',
      description: '在正式提交前明确企业侧和经办侧的责任节点，减少最后时点的等待。',
    },
  ],
  timeline: [
    { name: '资料预审', duration: 'T+0', description: '确认报关、收汇、合同和发票的基础匹配关系。' },
    { name: '差异复核', duration: 'T+1', description: '针对到账差额、批次拆分或币种问题给出修正建议。' },
    { name: '核销提交', duration: 'T+2', description: '整理终版材料并进入正式核销办理流程。' },
    { name: '回执归档', duration: 'T+3', description: '对回执和补件记录做归档，便于后续抽查与复盘。' },
  ],
  documentGroups: [
    {
      title: '交易与报关资料',
      items: ['出口合同/订单', '报关单', '商业发票', '装箱单'],
    },
    {
      title: '银行与收汇资料',
      items: ['银行回单', '收汇水单', '结汇或入账凭证'],
    },
    {
      title: '辅助说明资料',
      items: ['异常说明', '批次映射表', '内部审批记录'],
    },
  ],
  faqs: [
    {
      question: '哪些情况最容易导致核销延期？',
      answer: '最常见的是到账批次和报关批次映射不清，以及回单、发票、合同口径不一致。',
    },
    {
      question: '可以只做预审，不立即正式提交吗？',
      answer: '可以。预审阶段会先输出缺口清单和提交顺序，适合先摸清问题再安排办理窗口。',
    },
    {
      question: '适合哪些业务团队使用？',
      answer: '适合出口跟单、财务结算和单证团队共同使用，尤其适合批次多、账期密集的项目。',
    },
    {
      question: '如果银行资料还没齐，可以先启动吗？',
      answer: '可以先启动预审。系统会先标注缺件位置，待水单补齐后再进入正式提交阶段。',
    },
  ],
  primaryCta: { label: '启动核销预审', href: '/login' },
  secondaryCta: { label: '查看退税申报', href: '/tax-refunds' },
  aside: (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">适用场景</p>
      <p className="text-sm leading-6 text-muted-foreground">
        多批次收汇、回款周期拉长、或需要快速识别哪一笔单据卡住核销进度时，优先走这一页。
      </p>
    </div>
  ),
};

export default function ForexVerificationsPage() {
  return <ServicePage config={forexVerificationConfig} />;
}
