import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { expect, it, vi, beforeEach } from 'vitest';
import InvoicesPage from './page';
const invoices=vi.fn();
vi.mock('next/navigation',()=>({useSearchParams:()=>({get:()=>null}),usePathname:()=>'/dashboard/finance/invoices'}));
vi.mock('@/services/bankFlow.service',()=>({getInvoices:(...args:unknown[])=>invoices(...args),getInvoiceStats:async()=>({validTotal:0,validTax:0,validCount:0,reversedCount:0}),getBatches:async()=>[]}));
vi.mock('./components/InvoiceImportDialog',()=>({InvoiceImportDialog:()=>null}));
beforeEach(()=>invoices.mockReset());
it('相似发票可通过完整号码区分，手机和表格均可识别',async()=>{
 invoices.mockResolvedValue({items:[{id:'test',invNo:'TEST-INV-123',seller:'测试',invDate:'2026-01-01',amount:1,tax:0,total:1,status:'正常',isPositive:'是'}],pagination:{total:1}});
 render(<InvoicesPage/>);expect(await screen.findAllByText('TEST-INV-123')).toHaveLength(2);
});
it('加载失败重试并恢复真实空态',async()=>{
 invoices.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({items:[],pagination:{total:0}});
 render(<InvoicesPage/>);await screen.findByText('发票台账读取失败');
 expect(screen.queryByText('暂无数据')).not.toBeInTheDocument();fireEvent.click(screen.getByText('重试'));
 await waitFor(()=>expect(screen.getAllByText('暂无数据')).toHaveLength(2));
});
