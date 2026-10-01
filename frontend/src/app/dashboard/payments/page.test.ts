import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
const source = readFileSync('src/app/dashboard/payments/page.tsx', 'utf8');
for (const kind of ['Payable', 'Receivable']) {
 it(`${kind} 登记保留所选历史日期`, async () => {
  const handler = source.match(new RegExp(`const handle${kind}Submit = async[\\s\\S]*?\\n  };`))![0].replace('data: PaymentSubmitData','data');
  const createPayment=vi.fn().mockResolvedValue({});
  const noop=()=>{};
  const build=new Function('financeService',`selected${kind}`,'PaymentType','toast',`setSelected${kind}`,'invalidateCache',`fetch${kind}s`,'fetchStats',`${handler};return handle${kind}Submit;`);
  const submit=build({createPayment},{id:'synthetic'},{PAYABLE:'PAYABLE',RECEIVABLE:'RECEIVABLE'},{success:noop,error:noop},noop,noop,noop,noop);
  await submit({amount:12,paymentMethod:'bank',paymentDate:new Date('2020-02-03T00:00:00Z')});
  expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({paymentDate:'2020-02-03T00:00:00.000Z'}));
 });
}
it('两张合同的余额只使用各自归属付款',()=>{
 const formula=source.match(/const actualPaid = ([^;]+);/)![1];
 const compute=new Function('contract','bp',`return ${formula};`);
 expect([{paidAmount:20},{paidAmount:0}].map(contract=>compute(contract,{netPaid:100}))).toEqual([20,0]);
});
