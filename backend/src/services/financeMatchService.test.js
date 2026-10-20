const test=require('node:test');
const assert=require('node:assert/strict');
const prisma=require('../utils/prisma');
const service=require('./financeMatchService');
test('未匹配分页与总数共享搜索条件，可达第二页历史记录',async(t)=>{
 const bank={findMany:prisma.bankTransaction.findMany,count:prisma.bankTransaction.count};
 const invoice={findMany:prisma.invoiceRecord.findMany,count:prisma.invoiceRecord.count};
 t.after(()=>{Object.assign(prisma.bankTransaction,bank);Object.assign(prisma.invoiceRecord,invoice);});
 const calls=[];
 prisma.bankTransaction.findMany=async(args)=>{calls.push(args);return[{id:'bank-old'}];};
 prisma.bankTransaction.count=async(args)=>{calls.push(args);return 21;};
 prisma.invoiceRecord.findMany=async(args)=>{calls.push(args);return[{id:'invoice-old'}];};
 prisma.invoiceRecord.count=async(args)=>{calls.push(args);return 22;};
 const result=await service.getUnmatchedItems({page:2,pageSize:20,search:'synthetic'});
 assert.equal(result.bankTotal,21);assert.equal(result.invoiceTotal,22);
 assert.equal(calls[0].skip,20);assert.equal(calls[2].skip,20);
 assert.deepEqual(calls[0].where,calls[1].where);assert.deepEqual(calls[2].where,calls[3].where);
 assert.ok(calls[0].where.OR.some(filter=>filter.counterpart));assert.ok(calls[2].where.OR.some(filter=>filter.invNo));
});
