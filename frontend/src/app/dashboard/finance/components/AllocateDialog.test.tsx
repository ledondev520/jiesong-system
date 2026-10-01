import { render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AllocateDialog } from './AllocateDialog';
import type { Payment } from '@/types';
const getReceivables=vi.fn();
vi.mock('@/services/finance.service',()=>({financeService:{getReceivables:(...args:unknown[])=>getReceivables(...args)}}));
it('打开分配时初始化并加载全部分页，不受收付当前列表页限制',async()=>{
 getReceivables.mockImplementation(async({page}:{page:number})=>({data:{items:[{id:`contract-${page}`,contractNo:`EXP-PAGE-${page}`,totalAmount:100,receivedAmount:0,unreceiveAmount:100}],pagination:{totalPages:2}}}));
 render(<AllocateDialog open onOpenChange={()=>{}} payment={{id:'synthetic',amount:100,currency:'USD'} as Payment} onSubmit={vi.fn()}/>);
 await screen.findByText('EXP-PAGE-2');
 await waitFor(()=>expect(getReceivables).toHaveBeenCalledWith({page:2,pageSize:100,outstandingOnly:true}));
 expect(screen.getByText('EXP-PAGE-1')).toBeInTheDocument();
});
