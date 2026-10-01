import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PaymentDialog } from './PaymentDialog';
import { PaymentType } from '@/types';
vi.mock('@/components/ui/date-picker', () => ({ DatePicker: () => <span>日期</span> }));
vi.mock('@/components/ui/select', () => ({
 Select: ({onValueChange,children}: {onValueChange:(value:string)=>void;children:React.ReactNode}) => <div><button type="button" onClick={()=>onValueChange('bank')}>银行转账</button>{children}</div>,
 SelectContent: () => null, SelectItem: () => null, SelectTrigger: ({children}: {children:React.ReactNode}) => <div>{children}</div>, SelectValue: () => null,
}));
it('部分金额修改后可提交数值，空金额不能提交', async () => {
 const submit=vi.fn().mockResolvedValue(undefined);
 render(<PaymentDialog open onOpenChange={()=>{}} type={PaymentType.PAYABLE} contractId="synthetic" contractNo="测试" remainingAmount={100} onSubmit={submit}/>);
 fireEvent.click(screen.getByText('银行转账'));
 fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'12.34'}});
 await waitFor(()=>expect(screen.getByText('确认记录')).toBeEnabled());
 fireEvent.click(screen.getByText('确认记录'));
 await waitFor(()=>expect(submit).toHaveBeenCalledWith(expect.objectContaining({amount:12.34})));
 fireEvent.change(screen.getByRole('spinbutton'),{target:{value:''}});
 await waitFor(()=>expect(screen.getByText('确认记录')).toBeDisabled());
});
