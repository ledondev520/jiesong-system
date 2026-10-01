import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { expect, it, vi, beforeEach } from 'vitest';
import BankFlowPage from './page';
const transactions=vi.fn();const stats=vi.fn();
vi.mock('next/navigation',()=>({useSearchParams:()=>({get:()=>null}),usePathname:()=>'/dashboard/finance/bank-flow'}));
vi.mock('@/services/bankFlow.service',()=>({getTransactions:(...args:unknown[])=>transactions(...args),getTransactionStats:(...args:unknown[])=>stats(...args),getBatches:async()=>[]}));
vi.mock('./components/BankFlowImportDialog',()=>({BankFlowImportDialog:()=>null}));
beforeEach(()=>{transactions.mockReset();stats.mockReset();stats.mockResolvedValue({totalIn:0,totalOut:0,netFlow:0,txnCount:0,currency:'CNY'});transactions.mockResolvedValue({items:[],pagination:{total:21}});});
it('金额筛选进入列表和统计请求，下一页保持同条件',async()=>{
 render(<BankFlowPage/>);
 await waitFor(()=>expect(transactions).toHaveBeenCalled());
 fireEvent.change(screen.getByPlaceholderText('最小金额'),{target:{value:'1000000'}});
 await waitFor(()=>expect(transactions).toHaveBeenLastCalledWith(expect.objectContaining({amountMin:1000000,currency:'CNY',page:1})));
 expect(stats).toHaveBeenLastCalledWith(expect.objectContaining({amountMin:1000000,currency:'CNY'}));
 fireEvent.click(screen.getAllByRole('button').find(button=>button.querySelector('.lucide-chevron-right'))!);
 await waitFor(()=>expect(transactions).toHaveBeenLastCalledWith(expect.objectContaining({amountMin:1000000,page:2})));
});
it('请求失败有明确重试，不能当空流水',async()=>{
 transactions.mockRejectedValueOnce(new Error('offline'));
 render(<BankFlowPage/>);await screen.findByText('银行流水读取失败');
 expect(screen.queryByText('暂无数据')).not.toBeInTheDocument();
 fireEvent.click(screen.getByText('重试'));
 await waitFor(()=>expect(transactions).toHaveBeenCalledTimes(2));
});
