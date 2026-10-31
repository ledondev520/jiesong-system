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
 for(const args of [[],['PAYMENT']]){
  const rows=await service.loadPurchaseContracts(...args);
  assert.deepEqual(seenWhere.status,{notIn:['DRAFT','CANCELLED']}); // payablesService.payableWhere：粗过滤，权威口径是 isInEffect/outstandingOf
  assert.equal(Object.hasOwn(seenWhere,'NOT'),false);
  const unpaid=Object.fromEntries(rows.map((row)=>[row.id,row.unpaidAmount]));
  assert.equal(unpaid.signed,60);
  assert.equal(unpaid.over,0,'多付按 0，不抵减其他合同');
  assert.equal(unpaid.draft,0,'即使数据库返回草稿行也不产生未付余额');
 }
});

test('发票关联候选保持原范围：含草稿、只排除已取消，未付余额沿用原算法',async(t)=>{
 const original=prisma.purchaseContract.findMany;
 t.after(()=>{prisma.purchaseContract.findMany=original;});
 let seenWhere;
 prisma.purchaseContract.findMany=async(args)=>{seenWhere=args.where;return[{id:'draft',status:'DRAFT',totalAmount:70,paidAmount:20,supplier:{name:'合成供应商丙'}}];};
 const rows=await service.loadPurchaseContracts(service.MATCH_PURPOSE.INVOICE);
 assert.deepEqual(seenWhere,{NOT:{status:'CANCELLED'}});
 assert.equal(rows[0].unpaidAmount,50);
});

test('付款选择器用 isInEffect 剔除旧拼写的草稿/已取消行，发票用途保留',async(t)=>{
 const purchase=prisma.purchaseContract.findMany;
 t.after(()=>{prisma.purchaseContract.findMany=purchase;});
 prisma.purchaseContract.findMany=async()=>[{id:'ok',status:'SIGNED'},{id:'old-draft',status:' draft '},{id:'old-cancel',status:'cancelled'}];
 assert.deepEqual((await service.listContractsForMatch('PURCHASE','','PAYMENT')).map(r=>r.id),['ok']);
 assert.equal((await service.listContractsForMatch('PURCHASE','','INVOICE')).length,3);
});

test('合同选择器按用途划分：付款匹配不含草稿，发票关联含草稿，两者都不含已取消；销售合同不受影响',async(t)=>{
 const purchase=prisma.purchaseContract.findMany;
 const sales=prisma.salesContract.findMany;
 t.after(()=>{prisma.purchaseContract.findMany=purchase;prisma.salesContract.findMany=sales;});
 const wheres=[];
 prisma.purchaseContract.findMany=async(args)=>{wheres.push(args.where);return[];};
 prisma.salesContract.findMany=async(args)=>{wheres.push(args.where);return[];};
 await service.listContractsForMatch('PURCHASE','甲');
 await service.listContractsForMatch('PURCHASE','甲','PAYMENT');
 await service.listContractsForMatch('PURCHASE','甲','INVOICE');
 await service.listContractsForMatch('SALES','',  'PAYMENT');
 for(const where of wheres.slice(0,2)){
  assert.deepEqual(where.status,{notIn:['DRAFT','CANCELLED']},'缺省与 PAYMENT 都排除草稿/已取消（应付口径）');
  assert.equal(Object.hasOwn(where,'NOT'),false);
  assert.equal(where.OR.length,2,'搜索条件保留');
 }
 assert.deepEqual(wheres[2].NOT,{status:'CANCELLED'});
 assert.equal(Object.hasOwn(wheres[2],'status'),false);
 assert.deepEqual(wheres[3].NOT,{status:'CANCELLED'});
});
