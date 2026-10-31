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

test('付款匹配候选只含已生效采购合同，未付余额与应付口径一致（草稿不是应付）',async(t)=>{
 const original=prisma.purchaseContract.findMany;
 t.after(()=>{prisma.purchaseContract.findMany=original;});
 let seenWhere;
 prisma.purchaseContract.findMany=async(args)=>{seenWhere=args.where;return[
  {id:'signed',status:'SIGNED',totalAmount:100,paidAmount:40,supplier:{name:'合成供应商甲'}},
  {id:'over',status:'COMPLETED',totalAmount:50,paidAmount:80,supplier:{name:'合成供应商乙'}},
  {id:'draft',status:'DRAFT',totalAmount:70,paidAmount:0,supplier:{name:'合成供应商丙'}},
 ];};
 const rows=await service.loadPurchaseContracts();
 assert.deepEqual(seenWhere.status.in.sort(),['COMPLETED','PRODUCING','READY','RECEIVED','SHIPPED','SIGNED']);
 assert.equal(Object.hasOwn(seenWhere,'NOT'),false);
 const unpaid=Object.fromEntries(rows.map((row)=>[row.id,row.unpaidAmount]));
 assert.equal(unpaid.signed,60);
 assert.equal(unpaid.over,0,'多付按 0，不抵减其他合同');
 assert.equal(unpaid.draft,0,'即使数据库返回草稿行也不产生未付余额');
});

