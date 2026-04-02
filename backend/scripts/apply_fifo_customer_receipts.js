#!/usr/bin/env node

const prisma = require('../src/utils/prisma');
const financeService = require('../src/services/financeService');

const customerName = process.argv[2] || 'Sp food trading LLC';

async function main() {
  const receipts = await prisma.payment.findMany({
    where: {
      customerName,
      OR: [{ type: 'INCOME' }, { type: 'RECEIVABLE_RECEIPT' }],
    },
    orderBy: { paymentDate: 'asc' },
    select: { id: true, paymentDate: true, amount: true, note: true },
  });

  const receivableResult = await financeService.getReceivables({ page: 1, pageSize: 500, skip: 0 });
  const contracts = [...receivableResult.receivables].sort((a, b) => {
    const ad = new Date(a.shippedAt || a.signedAt || 0).getTime();
    const bd = new Date(b.shippedAt || b.signedAt || 0).getTime();
    return ad - bd || String(a.contractNo).localeCompare(String(b.contractNo));
  });

  const working = contracts.map((contract) => ({
    id: contract.id,
    contractNo: contract.contractNo,
    remaining: Number(contract.unreceiveAmount.toFixed(2)),
  })).filter((contract) => contract.remaining > 0.01);

  const applied = [];

  for (const receipt of receipts) {
    let remaining = Number(receipt.amount.toFixed(2));
    const allocations = [];

    for (const contract of working) {
      if (remaining <= 0) break;
      if (contract.remaining <= 0) continue;

      const amount = Math.min(remaining, contract.remaining);
      allocations.push({
        salesContractId: contract.id,
        amount: Number(amount.toFixed(2)),
        note: `FIFO 自动分摊到 ${contract.contractNo}`,
      });

      contract.remaining = Number((contract.remaining - amount).toFixed(2));
      remaining = Number((remaining - amount).toFixed(2));
    }

    if (allocations.length > 0) {
      await financeService.allocatePaymentToContracts(receipt.id, allocations);
      applied.push({
        receiptId: receipt.id,
        receiptAmount: receipt.amount,
        allocationCount: allocations.length,
      });
    }
  }

  const outstanding = working
    .filter((contract) => contract.remaining > 0.01)
    .map((contract) => ({
      contractNo: contract.contractNo,
      remaining: contract.remaining,
    }));

  console.log(JSON.stringify({
    customerName,
    receiptCount: receipts.length,
    appliedCount: applied.length,
    outstanding,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
