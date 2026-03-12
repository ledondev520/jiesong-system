import type { Metadata } from 'next';
import { ServicePage, type ServicePageConfig } from '@/components/public/service-page';

export const metadata: Metadata = {
  title: '出口退税服务 | Jiesong System',
  description: '面向出口退税批次管理、单证归集和申报排期的公开页面。',
};

const taxRefundConfig: ServicePageConfig = {
  eyebrow: 'Public Service / Tax Refund',
  title: '出口退税申报工作台',
  description:
    '按批次梳理退税资料、申报口径与凭证缺口，把单证归集和窗口排期同步推进，帮助财务团队更稳地压缩申报周期。',
  metrics: [
    { label: '批次排期反馈', value: '48h', detail: '申报前给出节奏建议' },
    { label: '资料归集模块', value: '6组', detail: '按税务口径分层检查' },
    { label: '常见缺口识别', value: '15项', detail: '覆盖退税申报关键凭证' },
    { label: '补件优先级', value: 'A/B/C', detail: '先处理影响申报的核心问题' },
  ],
  highlights: [
    {
      title: '单证归集',
      description: '按批次整理申报口径与凭证缺口',
    },
    {
      title: '税额校对',
      description: '针对发票、报关与台账之间的税额差异做交叉复核，减少提交后退回。',
    },
    {
      title: '申报排期',
      description: '把补件优先级和正式申报时间拆开排程，让财务与业务动作更清晰。',
    },
  ],
  timeline: [
    { name: '批次建档', duration: 'Day 1', description: '按照合同、报关与开票信息建立本次退税批次。' },
    { name: '资料归集', duration: 'Day 2', description: '核对发票、报关单、收汇与台账资料是否完整。' },
    { name: '申报复核', duration: 'Day 3', description: '对申报口径、税额映射和异常说明进行终审。' },
    { name: '提交跟踪', duration: 'Day 4+', description: '进入正式申报并持续跟踪补件与结果反馈。' },
  ],
  documentGroups: [
    {
      title: '核心申报单据',
      items: ['报关单', '增值税发票', '出口发票', '申报台账'],
    },
    {
      title: '收汇与合同资料',
      items: ['收汇凭证', '出口合同', '客户对账附件'],
    },
    {
      title: '异常与补充材料',
      items: ['差异说明', '补件记录', '内部复核备注'],
    },
  ],
  faqs: [
    {
      question: '退税申报最常卡在哪个环节？',
      answer: '通常卡在发票、报关和台账口径不一致，或者批次资料没有同步归档完整。',
    },
    {
      question: '批次很多时如何安排优先级？',
      answer: '优先处理临近申报窗口、税额较大或缺口最少的批次，再安排需要补件的项目。',
    },
    {
      question: '能否和外汇核销流程一起协同？',
      answer: '可以。两条链路共享部分单证，先做好归集和映射能明显减少重复整理工作。',
    },
    {
      question: '适合什么阶段引入？',
      answer: '适合月度集中申报前，或发现批次堆积、补件反复时尽早引入。',
    },
  ],
  primaryCta: { label: '进入退税排期', href: '/login' },
  secondaryCta: { label: '查看外汇核销', href: '/forex-verifications' },
  aside: (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">推荐使用方式</p>
      <p className="text-sm leading-6 text-muted-foreground">
        先按批次建档，再由业务、财务和单证同页核对缺口，能更快形成可提交的退税清单。
      </p>
    </div>
  ),
};

export default function TaxRefundsPage() {
  return <ServicePage config={taxRefundConfig} />;
}
