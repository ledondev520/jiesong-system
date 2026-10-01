import { beforeEach, expect, it, vi } from 'vitest';
import api from '@/lib/axios';
import { purchaseReceiptService } from './purchaseReceipt.service';
const invalidation=vi.fn();
vi.mock('@/lib/axios',()=>({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('@/lib/api-cache',()=>({invalidateCache:(...args:unknown[])=>invalidation(...args)}));
beforeEach(()=>vi.clearAllMocks());
it('批次和验货历史都把实际页码传给后端',async()=>{
 await purchaseReceiptService.list('synthetic',{page:2,pageSize:20});
 expect(api.get).toHaveBeenCalledWith('/purchases/synthetic/receipts',{params:{page:2,pageSize:20}});
 await purchaseReceiptService.inspections('synthetic','receipt-test',{page:3,pageSize:20});
 expect(api.get).toHaveBeenCalledWith('/purchases/synthetic/receipts/receipt-test/inspections',{params:{page:3,pageSize:20}});
});
it('到货/验货成功失效采购与库存缓存，并共享同一幂等请求',async()=>{
 const requestId=crypto.randomUUID();let resolve:(value:unknown)=>void=()=>{};
 vi.mocked(api.post).mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
 const payload={requestId,arrivedAt:'2020-01-02T00:00:00.000Z',items:[{purchaseItemId:'synthetic',arrivedQuantity:4}]};
 const first=purchaseReceiptService.create('synthetic',payload);const second=purchaseReceiptService.create('synthetic',payload);
 expect(api.post).toHaveBeenCalledTimes(1);resolve({data:{}});await Promise.all([first,second]);
 expect(invalidation).toHaveBeenCalledWith('purchase-contracts-list');expect(invalidation).toHaveBeenCalledWith('inventory-list');
 vi.mocked(api.post).mockResolvedValueOnce({data:{}});
 await purchaseReceiptService.inspect('synthetic','receipt-test',{requestId:crypto.randomUUID(),note:'合成验货',items:[{receiptItemId:'synthetic',acceptedQuantity:4,reinspectionQuantity:0}]});
 expect(api.post).toHaveBeenLastCalledWith('/purchases/synthetic/receipts/receipt-test/inspection',expect.objectContaining({note:'合成验货'}));
});
it('失败不失效缓存，原requestId重试确实重发',async()=>{
 const payload={requestId:crypto.randomUUID(),arrivedAt:'2020-01-02T00:00:00.000Z',items:[{purchaseItemId:'synthetic',arrivedQuantity:4}]};
 vi.mocked(api.post).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({data:{}});
 await expect(purchaseReceiptService.create('synthetic',payload)).rejects.toThrow('offline');expect(invalidation).not.toHaveBeenCalled();
 await purchaseReceiptService.create('synthetic',payload);expect(api.post).toHaveBeenCalledTimes(2);
});
