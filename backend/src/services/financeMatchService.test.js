const test=require('node:test');
const assert=require('node:assert/strict');
const prisma=require('../utils/prisma');
const service=require('./financeMatchService');
const {VALID_INVOICE_WHERE}=require('./invoiceRecordService');
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

test('待匹配发票/流水不设条数上限：旧 take 500 会让更早的未达阈值记录永远排不进窗口',async(t)=>{
 const bank=prisma.bankTransaction.findMany;
 const invoice=prisma.invoiceRecord.findMany;
 t.after(()=>{prisma.bankTransaction.findMany=bank;prisma.invoiceRecord.findMany=invoice;});
 const calls=[];
 prisma.bankTransaction.findMany=async(args)=>{calls.push(args);return[];};
 prisma.invoiceRecord.findMany=async(args)=>{calls.push(args);return[];};
 await service.loadPendingBankTxns();
 await service.loadPendingInvoices();
 assert.equal(calls.length,2);
 for(const args of calls){
  assert.equal(args.take,undefined);
  assert.equal(args.where.matchStatus,'PENDING');
 }
});

test('自动关联只取有效发票：已红冲与负数发票不是候选，条件与共享口径一致',async(t)=>{
 const invoice=prisma.invoiceRecord.findMany;
 t.after(()=>{prisma.invoiceRecord.findMany=invoice;});
 let where;
 prisma.invoiceRecord.findMany=async(args)=>{where=args.where;return[];};
 await service.loadPendingInvoices();
 assert.deepEqual(where,{matchStatus:'PENDING',status:'正常',isPositive:'是'});
 assert.deepEqual({...VALID_INVOICE_WHERE},{status:'正常',isPositive:'是'});
});

test('自动匹配写银行流水时只改仍为 PENDING 的行；运行后相似度缓存已释放，重复运行结果一致',async(t)=>{
 const saved={bf:prisma.bankTransaction.findMany,bu:prisma.bankTransaction.updateMany,i:prisma.invoiceRecord.findMany,p:prisma.purchaseContract.findMany,s:prisma.salesContract.findMany};
 t.after(()=>{prisma.bankTransaction.findMany=saved.bf;prisma.bankTransaction.updateMany=saved.bu;prisma.invoiceRecord.findMany=saved.i;prisma.purchaseContract.findMany=saved.p;prisma.salesContract.findMany=saved.s;});
 const txn={id:'t1',counterpart:'合成供应商甲',direction:'OUT',amount:100,currency:'CNY',summary:'货款',txnDate:'2026-01-05'};
 prisma.bankTransaction.findMany=async()=>[txn];
 prisma.invoiceRecord.findMany=async()=>[];
 prisma.salesContract.findMany=async()=>[];
 prisma.purchaseContract.findMany=async()=>[{id:'c1',status:'SIGNED',totalAmount:100,paidAmount:0,signedAt:new Date('2026-01-01'),supplier:{name:'合成供应商甲'}}];
 const wheres=[];
 let count=0;
 prisma.bankTransaction.updateMany=async(args)=>{wheres.push(args.where);return{count};};
 const lost=await service.runAutoMatch();
 assert.equal(lost.bankMatched,0,'被人工处理过的行（updateMany 命中 0）不算自动关联');
 assert.deepEqual(wheres[0],{id:'t1',matchStatus:'PENDING'});
 count=1;
 const won=await service.runAutoMatch();
 assert.equal(won.bankMatched,1);
 assert.equal(won.details.bank[0].score,lost.details.bank[0].score);
});

// ---- INVMATCH-4：发票→采购合同护栏（累计额上限 / 税号冲突 / 早于签约）与自动关联重配 ----
const DAY=86400000;
function invoiceFixture(t,{contracts,invoices}){
 const saved={bf:prisma.bankTransaction.findMany,i:prisma.invoiceRecord.findMany,u:prisma.invoiceRecord.updateMany,p:prisma.purchaseContract.findMany,s:prisma.salesContract.findMany,tx:prisma.$transaction};
 t.after(()=>{prisma.bankTransaction.findMany=saved.bf;prisma.invoiceRecord.findMany=saved.i;prisma.invoiceRecord.updateMany=saved.u;prisma.purchaseContract.findMany=saved.p;prisma.salesContract.findMany=saved.s;prisma.$transaction=saved.tx;});
 const rows=invoices.map(r=>({status:'正常',isPositive:'是',matchStatus:'PENDING',matchedContractId:null,matchedContractType:null,matchScore:null,sellerTaxId:null,...r}));
 const writes=[];
 prisma.bankTransaction.findMany=async()=>[];
 prisma.salesContract.findMany=async()=>[];
 prisma.purchaseContract.findMany=async()=>contracts;
 prisma.invoiceRecord.findMany=async({where})=>rows.filter(r=>r.matchStatus===where.matchStatus&&(!where.matchedContractType||r.matchedContractType===where.matchedContractType));
 prisma.invoiceRecord.updateMany=async({where,data})=>{
  const row=rows.find(r=>r.id===where.id&&Object.entries(where).every(([k,v])=>r[k]===v));
  if(!row)return{count:0};
  Object.assign(row,data);writes.push({id:row.id,...data});return{count:1};
 };
 prisma.$transaction=async(fn)=>fn(prisma);
 return{rows,writes};
}
const contract=(over={})=>({id:'c1',contractNo:'CG-SYN-1',status:'DRAFT',totalAmount:38000,paidAmount:0,signedAt:new Date('2024-05-21'),supplier:{name:'合成供应商甲',taxId:'91SYNTHETIC00000001'},...over});
const invoice=(id,over={})=>({id,invNo:id,seller:'合成供应商甲',sellerTaxId:'91SYNTHETIC00000001',invDate:'2024-06-01',total:38000,...over});

test('同一合同多张同额发票：累计额上限只放行一张（CG2400009 型），最先开具者占额度',async(t)=>{
 const{writes}=invoiceFixture(t,{contracts:[contract()],invoices:[invoice('a',{invDate:'2025-02-24'}),invoice('b',{invDate:'2025-07-08'}),invoice('c',{invDate:'2025-07-08'}),invoice('d',{invDate:'2026-05-18'})]});
 const result=await service.runAutoMatch();
 assert.deepEqual(writes.map(w=>w.id),['a']);
 assert.equal(result.invoiceMatched,1);
});

test('已有人工关联发票也计入累计额：合同已满则新发票不再自动关联',async(t)=>{
 const{writes}=invoiceFixture(t,{contracts:[contract()],invoices:[invoice('manual',{matchStatus:'MATCHED',matchedContractId:'c1',matchedContractType:'PURCHASE',matchScore:100}),invoice('new')]});
 await service.runAutoMatch();
 assert.deepEqual(writes,[]);
});

test('累计额上限含首张发票：超合同额 1% 的单张不关联（CG2500075/82/112 型），1% 内仍可',async(t)=>{
 const over=invoiceFixture(t,{contracts:[contract()],invoices:[invoice('over',{total:38500})]});
 await service.runAutoMatch();
 assert.deepEqual(over.writes,[]);
 const within=invoiceFixture(t,{contracts:[contract()],invoices:[invoice('within',{total:38300})]});
 await service.runAutoMatch();
 assert.deepEqual(within.writes.map(w=>w.id),['within']);
});

test('税号冲突：同名/近似名称但税号不同不关联（CG2500050、CG2600012 型）；任一方缺税号退回名称判断',async(t)=>{
 const{writes}=invoiceFixture(t,{contracts:[contract({totalAmount:2600})],invoices:[
  invoice('same-name-other-tax',{total:2600,sellerTaxId:'91OTHER000000000009'}),
 ]});
 await service.runAutoMatch();
 assert.deepEqual(writes,[]);
 const ok=invoiceFixture(t,{contracts:[contract({totalAmount:2600}),contract({id:'c2',totalAmount:2600,supplier:{name:'合成供应商甲',taxId:null}})],invoices:[
  invoice('no-supplier-tax',{total:2600,sellerTaxId:'91OTHER000000000009'}),
  invoice('spaced-lowercase',{total:2600,sellerTaxId:' 91synthetic00000001 ',invDate:'2024-06-02'}),
 ]});
 await service.runAutoMatch();
 assert.equal(ok.writes.length,2);
});

test('开票日早于签约超过 30 天不关联（CG2500060、CG2600007 型），30 天内仍可',async(t)=>{
 const signed=new Date('2026-01-16');
 const day=(n)=>new Date(signed.getTime()+n*DAY).toISOString().slice(0,10);
 const{writes}=invoiceFixture(t,{contracts:[contract({totalAmount:50520,signedAt:signed})],invoices:[invoice('early-100d',{total:50520,invDate:day(-100)}),]});
 await service.runAutoMatch();
 assert.deepEqual(writes,[]);
 const near=invoiceFixture(t,{contracts:[contract({totalAmount:50520,signedAt:signed})],invoices:[invoice('early-25d',{total:50520,invDate:day(-25)})]});
 await service.runAutoMatch();
 assert.deepEqual(near.writes.map(w=>w.id),['early-25d']);
});

test('重配：只动自动采购关联（分数<100），人工/100 分/销售/待匹配不动；先试跑不写，应用后再跑为空（幂等）',async(t)=>{
 const link=(id,over={})=>invoice(id,{matchStatus:'MATCHED',matchedContractId:'c1',matchedContractType:'PURCHASE',matchScore:82,...over});
 const{rows,writes}=invoiceFixture(t,{contracts:[contract()],invoices:[
  link('auto-keep',{invDate:'2025-02-24'}),
  link('auto-dup-1',{invDate:'2025-07-08'}),
  link('auto-dup-2',{invDate:'2026-05-18'}),
  link('auto-wrong-tax',{sellerTaxId:'91OTHER000000000009',total:1000}),
  link('manual',{matchScore:100,invDate:'2026-06-01'}),
  link('sales-link',{matchedContractType:'SALES',matchedContractId:'s1'}),
  invoice('pending'),
 ]});
 const dry=await service.rematchAutoInvoiceLinks();
 assert.equal(writes.length,0,'默认只出报告，不写库');
 assert.equal(dry.mode,'dry-run');
 // 人工 100 分的 38000 已占满合同额：所有自动 38000 发票都被挤出，错税号的也被解除
 assert.deepEqual(dry.changes.map(c=>c.id).sort(),['auto-dup-1','auto-dup-2','auto-keep','auto-wrong-tax']);
 assert.ok(dry.changes.every(c=>c.action==='UNLINK'&&c.toContractId===null));
 const applied=await service.rematchAutoInvoiceLinks({apply:true});
 assert.equal(applied.applied,4);
 const byId=Object.fromEntries(rows.map(r=>[r.id,r]));
 for(const id of ['auto-keep','auto-dup-1','auto-dup-2','auto-wrong-tax'])assert.equal(byId[id].matchStatus,'PENDING');
 assert.equal(byId.manual.matchStatus,'MATCHED');assert.equal(byId.manual.matchedContractId,'c1');
 assert.equal(byId['sales-link'].matchedContractId,'s1');
 assert.equal(byId.pending.matchStatus,'PENDING');
 const again=await service.rematchAutoInvoiceLinks({apply:true});
 assert.deepEqual(again.changes,[]);assert.equal(again.applied,0);
});

test('重配：无冲突时保留原关联；乐观条件让并发被人工改动的行跳过而不是覆盖',async(t)=>{
 const fixture=invoiceFixture(t,{contracts:[contract({totalAmount:60000})],invoices:[
  invoice('ok',{total:60000,matchStatus:'MATCHED',matchedContractId:'c1',matchedContractType:'PURCHASE',matchScore:90}),
  invoice('bad',{total:600,sellerTaxId:'91OTHER000000000009',matchStatus:'MATCHED',matchedContractId:'c1',matchedContractType:'PURCHASE',matchScore:90}),
 ]});
 const realFind=prisma.invoiceRecord.findMany;
 prisma.invoiceRecord.findMany=async(args)=>{const found=await realFind(args);fixture.rows.find(r=>r.id==='bad').matchScore=100;return found.map(r=>({...r,matchScore:r.id==='bad'?90:r.matchScore}));};
 const result=await service.rematchAutoInvoiceLinks({apply:true});
 assert.deepEqual(result.changes.map(c=>c.id),['bad']);
 assert.equal(result.kept,1);assert.equal(result.applied,0);assert.equal(result.skipped,1);
 assert.equal(fixture.rows.find(r=>r.id==='bad').matchStatus,'MATCHED','读后被改成人工 100 分：不覆盖');
});

test('重配 MOVE：最优合同已被人工发票占满时，自动关联移到次优合同并写入新合同与新分数',async(t)=>{
 const link=(id,over={})=>invoice(id,{matchStatus:'MATCHED',matchedContractId:'c1',matchedContractType:'PURCHASE',...over});
 const fixture=invoiceFixture(t,{contracts:[contract(),contract({id:'c2',contractNo:'CG-SYN-2',totalAmount:40000})],invoices:[
  link('manual',{matchScore:100}),
  link('mover',{matchScore:90}),
 ]});
 const dry=await service.rematchAutoInvoiceLinks();
 assert.equal(dry.changes.length,1);
 const[change]=dry.changes;
 assert.deepEqual({id:change.id,action:change.action,from:change.fromContractId,fromScore:change.fromScore,to:change.toContractId},{id:'mover',action:'MOVE',from:'c1',fromScore:90,to:'c2'});
 assert.ok(change.toScore>=70&&change.toScore<100,'次优合同分数达阈值但不到 100（否则会被当成人工锁定）');
 assert.equal(fixture.writes.length,0);
 const applied=await service.rematchAutoInvoiceLinks({apply:true});
 assert.equal(applied.applied,1);
 const row=fixture.rows.find(r=>r.id==='mover');
 assert.equal(row.matchedContractId,'c2');assert.equal(row.matchScore,change.toScore);
 assert.equal(row.matchStatus,'MATCHED');assert.equal(row.matchedContractType,'PURCHASE');
 assert.equal(fixture.rows.find(r=>r.id==='manual').matchedContractId,'c1','人工关联不动');
 assert.deepEqual((await service.rematchAutoInvoiceLinks({apply:true})).changes,[]);
});

test('重配 P3-1：销售分更高而保持原采购关联的发票，仍占原采购合同的累计额度',async(t)=>{
 const link=(id,over={})=>invoice(id,{matchStatus:'MATCHED',matchedContractId:'c1',matchedContractType:'PURCHASE',matchScore:85,...over});
 const fixture=invoiceFixture(t,{contracts:[contract({totalAmount:40000})],invoices:[link('salesy',{buyer:'合成买家'}),link('other')]});
 prisma.salesContract.findMany=async()=>[{id:'s1',contractNo:'XS-SYN-1',status:'SIGNED',totalAmount:38000,receivedAmount:0,signedAt:new Date('2024-05-21'),packingItems:[{store:{name:'合成买家'}}]}];
 const result=await service.rematchAutoInvoiceLinks({apply:true});
 assert.deepEqual(result.changes.map(c=>[c.id,c.action]),[['other','UNLINK']],'salesy 保持原样（算 kept），other 因合同额度被占而解除');
 assert.equal(fixture.rows.find(r=>r.id==='salesy').matchedContractId,'c1');
 assert.equal(fixture.rows.find(r=>r.id==='other').matchStatus,'PENDING');
});

test('同分排队 P3-3：金额更贴近合同额者先占额度，而不是开票日更早者',async(t)=>{
 const{writes}=invoiceFixture(t,{contracts:[contract()],invoices:[invoice('far-early',{total:38030,invDate:'2024-05-25'}),invoice('near-late',{total:38000,invDate:'2024-06-10'})]});
 await service.runAutoMatch();
 assert.deepEqual(writes.map(w=>w.id),['near-late']);
});
