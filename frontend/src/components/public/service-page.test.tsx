import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ServicePage } from './service-page';

describe('ServicePage', () => {
  it('renders the configured hero, metrics, workflow, documents, faq, and CTAs', () => {
    render(
      <ServicePage
        config={{
          eyebrow: '跨境服务 / Test',
          title: '测试服务标题',
          description: '面向出口业务的测试说明。',
          themeClassName: 'from-sky-500/10 via-background to-amber-500/10',
          metrics: [
            { label: '平均反馈', value: '24h', detail: '工作日内' },
            { label: '材料校核', value: '12项', detail: '逐项确认' },
          ],
          highlights: [
            {
              title: '前置诊断',
              description: '先梳理单证和缺口，再安排申报顺序。',
            },
            {
              title: '节点跟催',
              description: '跟进每个窗口期，避免超时返工。',
            },
          ],
          timeline: [
            { name: '资料预审', duration: 'T+0', description: '确认申报条件与资料状态。' },
            { name: '正式提交', duration: 'T+1', description: '整理后完成对外提交。' },
          ],
          documentGroups: [
            {
              title: '基础资料',
              items: ['报关单', '发票', '银行水单'],
            },
          ],
          faqs: [
            {
              question: '多久能完成？',
              answer: '通常在资料齐备后 3 到 5 个工作日完成。',
            },
          ],
          primaryCta: { label: '立即提交需求', href: '/login' },
          secondaryCta: { label: '查看税务服务', href: '/tax-refunds' },
        }}
      />
    );

    expect(screen.getByRole('heading', { name: '测试服务标题' })).toBeInTheDocument();
    expect(screen.getByText('跨境服务 / Test')).toBeInTheDocument();
    expect(screen.getByText('24h')).toBeInTheDocument();
    expect(screen.getByText('材料校核')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '服务亮点' })).toBeInTheDocument();
    expect(screen.getByText('前置诊断')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '办理流程' })).toBeInTheDocument();
    expect(screen.getByText('正式提交')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '资料清单' })).toBeInTheDocument();

    const documentsCard = screen.getByRole('heading', { name: '基础资料' }).closest('[data-slot="card"]');
    expect(documentsCard).not.toBeNull();
    expect(within(documentsCard as HTMLElement).getByText('报关单')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: '常见问题' })).toBeInTheDocument();
    expect(screen.getByText('多久能完成？')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '立即提交需求' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: '查看税务服务' })).toHaveAttribute('href', '/tax-refunds');
  });
});
