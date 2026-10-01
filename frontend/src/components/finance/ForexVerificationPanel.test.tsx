import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { expect, it, vi, beforeEach } from 'vitest';
import { ForexVerificationPanel } from './ForexVerificationPanel';
const getAll=vi.fn();const update=vi.fn();
vi.mock('@/services/forexVerification.service',()=>({forexVerificationService:{getAll:(...args:unknown[])=>getAll(...args),update:(...args:unknown[])=>update(...args)}}));
vi.mock('@/store/auth.store',()=>({useAuthStore:(selector:(state:unknown)=>unknown)=>selector({user:{role:'FINANCE'}})}));
beforeEach(()=>{getAll.mockReset();update.mockReset();});
it('读取合同相关核销并维护金额和历史日期',async()=>{
 getAll.mockResolvedValue({data:{items:[{id:'fx1',verificationNo:'FX-TEST',salesContractId:'sc1',currency:'USD',receivedAmount:100,status:'PENDING'}],pagination:{total:1}}});update.mockResolvedValue({});
 render(<ForexVerificationPanel salesContractId="sc1"/>);
 await screen.findByText('FX-TEST · 待核销');
 expect(getAll).toHaveBeenCalledWith({salesContractId:'sc1',keyword:'',page:1,pageSize:20});
 fireEvent.click(screen.getByText('维护跟进'));
 fireEvent.change(screen.getByLabelText('到账金额（USD）'),{target:{value:'12.34'}});
 fireEvent.change(screen.getByLabelText('核销日期'),{target:{value:'2020-01-02'}});
 fireEvent.click(screen.getByText('保存跟进'));
 await waitFor(()=>expect(update).toHaveBeenCalledWith('fx1',expect.objectContaining({receivedAmount:12.34,verifiedAt:'2020-01-02'})));
});
it('读取失败显式重试',async()=>{
 getAll.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({data:{items:[],pagination:{total:0}}});
 render(<ForexVerificationPanel salesContractId="sc1"/>);
 await screen.findByText('核销记录读取失败');fireEvent.click(screen.getByText('重试'));
 await screen.findByText('尚无匹配的核销记录；可从出口详情生成三表。');expect(getAll).toHaveBeenCalledTimes(2);
});
