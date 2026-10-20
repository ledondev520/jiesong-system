import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { FinancialStatementsOverview } from './FinancialStatementsOverview';

type Props=Parameters<typeof FinancialStatementsOverview>[0];
const props = (trends: object[]) => ({
 analytics:{latestPeriod:{periodLabel:'2026年3月'},trends},
 currentDetail:{year:2026,month:1,periodLabel:'2026年1月'},currentPeriod:null,
 dangerAlerts:[],warningAlerts:[],debtRatioVal:0.5,detailLoading:false,hasData:true,
 latestBalanceSheet:{totalEquity:100,totalAssets:200,totalLiabilities:100},
 latestIncomeStatement:{revenueMonth:200,revenueYTD:200,netProfitMonth:20,netProfitYTD:20},
 onOpenUploadDialog:()=>{},onSelectPeriod:()=>{},periods:[],selectedPeriod:'2026-1',showHeader:false,
} as unknown as Props);
it('历史1月与上一自然年12月比较，健康提示标出最新账期',()=>{
 render(<FinancialStatementsOverview {...props([{year:2025,month:12,revenue:100,netProfit:10},{year:2026,month:1,revenue:200,netProfit:20},{year:2026,month:2,revenue:999,netProfit:999},{year:2026,month:3,revenue:999,netProfit:999}])}/>);
 const title=screen.getByText('本期营业收入（2026年1月）');
 expect(within(title.closest('[data-slot="card"]') as HTMLElement).getByText('环比 +100.0%')).toBeInTheDocument();
 expect(screen.getByText('健康提示与预警基于最新账期：2026年3月')).toBeInTheDocument();
});
it('缺失紧前月份时不能用其他历史期冒充环比',()=>{
 render(<FinancialStatementsOverview {...props([{year:2025,month:11,revenue:100},{year:2026,month:1,revenue:200}])}/>);
 expect(screen.getAllByText('无可比上期数据')).toHaveLength(4);
});
