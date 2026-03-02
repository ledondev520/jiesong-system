const prisma = require('../../utils/prisma');

const STOP_WORDS = ['是什么', '在哪', '多少', '有没有', '能不能', '怎么', '哪里', '哪个', '什么', '请', '帮我', '查询', '查一下', '找', '看看'];

const extractKeywords = (message) => {
  let text = message;
  STOP_WORDS.forEach((word) => {
    text = text.replace(new RegExp(word, 'g'), ' ');
  });

  const chineseWords = text.match(/[\u4e00-\u9fa5]{2,10}/g) || [];
  const contractNos = text.match(/[A-Za-z]{2,3}\d+/g) || [];
  const containerNos = text.match(/\d{2}-\d{3}(-\w+)?/g) || [];

  return [...new Set([...chineseWords, ...contractNos, ...containerNos])].slice(0, 5);
};

const addQuery = (tasks, name, query) => {
  tasks.push({ name, query });
};

const buildContextQueries = (message) => {
  const lowerMsg = message.toLowerCase();
  const keywords = extractKeywords(message);
  const purchaseKeyword = message.match(/CG\d+/i)?.[0];
  const salesKeyword = message.match(/EXP\d+/i)?.[0];
  const containerNeedle = message.match(/\d{2}-\d{3}(-\w+)?/)?.[0];
  const shouldSearchContract = lowerMsg.includes('合同') || lowerMsg.includes('cg') || lowerMsg.includes('exp') || lowerMsg.includes('采购') || lowerMsg.includes('销售');
  const shouldSearchContainer = lowerMsg.includes('货柜') || lowerMsg.includes('集装箱') || lowerMsg.includes('柜') || lowerMsg.match(/\d{2}-\d{3}/);
  const shouldSearchInventory = lowerMsg.includes('位置') || lowerMsg.includes('在哪') || lowerMsg.includes('库存') || lowerMsg.includes('多少');
  const shouldSearchPrice = lowerMsg.includes('价格') || lowerMsg.includes('售价') || lowerMsg.includes('成本');
  const shouldSearchFinance = lowerMsg.includes('付款') || lowerMsg.includes('欠款') || lowerMsg.includes('应付') || lowerMsg.includes('应收') || lowerMsg.includes('财务');
  const shouldSearchProduct = lowerMsg.includes('商品') || lowerMsg.includes('产品') || lowerMsg.includes('货');
  const shouldSearchSupplier = lowerMsg.includes('供应商') || lowerMsg.includes('厂家') || lowerMsg.includes('谁');
  const tasks = [];

  addQuery(tasks, 'stats', () => Promise.all([
    prisma.product.count(),
    prisma.supplier.count(),
    prisma.purchaseContract.count(),
    prisma.salesContract.count(),
  ]));

  if (shouldSearchProduct) {
    keywords.forEach((keyword) => addQuery(tasks, `product:${keyword}`, () =>
      safe(prisma.product.findMany({
        where: { customsName: { contains: keyword } },
        take: 5,
      }))
    ));
  }

  if (shouldSearchSupplier) {
    keywords.forEach((keyword) => addQuery(tasks, `supplier:${keyword}`, () =>
      safe(prisma.supplier.findMany({
        where: { OR: [{ name: { contains: keyword } }, { shortName: { contains: keyword } }] },
        take: 5,
      }))
    ));
  }

  if (shouldSearchContract) {
    if (purchaseKeyword) {
      addQuery(tasks, `purchase:exact:${purchaseKeyword}`, () =>
        safe(prisma.purchaseContract.findMany({
          where: { contractNo: { contains: purchaseKeyword.toUpperCase() } },
          include: { supplier: true },
          take: 3,
        }))
      );
    }

    if (salesKeyword) {
      const salesKeywordUpper = salesKeyword.toUpperCase();
      addQuery(tasks, `sales:exact:${salesKeywordUpper}`, () =>
        safe(prisma.salesContract.findMany({
          where: { contractNo: { contains: salesKeywordUpper } },
          include: {
            items: {
              include: {
                product: true,
                store: true,
              },
            },
          },
          take: 3,
        }))
      );

      const fuzzyKeyword = salesKeywordUpper.replace(/EXP/, '');
      if (fuzzyKeyword) {
        addQuery(tasks, `sales:fuzzy:${fuzzyKeyword}`, () =>
          safe(prisma.salesContract.findMany({
            where: { contractNo: { contains: fuzzyKeyword } },
            include: {
              items: {
                include: {
                  product: true,
                  store: true,
                },
              },
            },
            take: 3,
          }))
        );
      }
    } else if (!purchaseKeyword) {
      addQuery(tasks, 'sales:recent', () =>
        safe(prisma.salesContract.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { supplier: true },
        }))
      );
    }
  }

  if (shouldSearchContainer) {
    if (containerNeedle) {
      addQuery(tasks, `container:exact:${containerNeedle}`, () =>
        safe(prisma.salesContract.findMany({
          where: { contractNo: { contains: containerNeedle } },
          include: { port: true, packingItems: { include: { product: true } } },
          take: 3,
        }))
      );
    } else {
      addQuery(tasks, 'container:recent', () =>
        safe(prisma.salesContract.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { port: true, packingItems: { include: { product: true } } },
        }))
      );
    }
  }

  if (shouldSearchInventory) {
    keywords.forEach((keyword) => addQuery(tasks, `inventory:${keyword}`, () =>
      safe(prisma.inventory.findMany({
        where: { product: { customsName: { contains: keyword } } },
        include: { product: true, salesContract: { include: { port: true } } },
        take: 5,
      }))
    ));
  }

  if (shouldSearchPrice) {
    addQuery(tasks, 'exchange', () => safe(prisma.systemConfig.findUnique({ where: { key: 'exchangeRate' } })));
  }

  if (shouldSearchFinance) {
    addQuery(tasks, 'finance', () =>
      safe(Promise.all([
        prisma.purchaseContract.aggregate({
          where: { NOT: { status: 'CANCELLED' } },
          _sum: { totalAmount: true, paidAmount: true },
        }),
        prisma.salesContract.aggregate({
          where: { NOT: { status: 'CANCELLED' } },
          _sum: { totalAmount: true, receivedAmount: true },
        }),
      ]))
    );
  }

  return { tasks, salesKeyword };
};

const safe = async (promise) => {
  try {
    return await promise;
  } catch {
    return null;
  }
};

const collectContextData = async (tasks) => {
  const taskEntries = await Promise.all(tasks.map(async ({ name, query }) => ({
    name,
    value: await query(),
  })));
  return taskEntries.reduce((acc, entry) => {
    acc[entry.name] = entry.value;
    return acc;
  }, {});
};

const appendContextLines = (context, byName, salesKeyword) => {
  if (Array.isArray(byName.stats)) {
    const [productCount, supplierCount, purchaseCount, salesCount] = byName.stats;
    context.push(`【系统统计】商品${productCount}种, 供应商${supplierCount}家, 采购合同${purchaseCount}份, 销售合同${salesCount}份, 货柜${salesCount}个`);
  }

  Object.entries(byName).forEach(([name, value]) => {
    if (!Array.isArray(value) || value.length === 0) {
      return;
    }

    if (name.startsWith('product:')) {
      const keyword = name.replace('product:', '');
      context.push(`【商品\"${keyword}\"】找到${value.length}条: ` + value.map((item) => `${item.customsName}(${item.unit})`).join(', '));
    }

    if (name.startsWith('supplier:')) {
      const keyword = name.replace('supplier:', '');
      context.push(`【供应商\"${keyword}\"】找到${value.length}家: ` + value.map((item) => `${item.name}(${item.shortName || '无简称'})`).join(', '));
    }

    if (name.startsWith('inventory:')) {
      const keyword = name.replace('inventory:', '');
      context.push(`【库存\"${keyword}\"】` + value.map((item) =>
        `${item.product.customsName}: ${item.quantity}${item.product.unit}, 货柜${item.salesContract?.contractNo || '未装柜'}, 状态${item.status}`
      ).join('; '));
    }
  });

  const exactSales = Object.entries(byName).find(([name]) => name.startsWith('sales:exact:'));
  if (exactSales && exactSales[1].length > 0) {
    exactSales[1].forEach((contract) => {
      const itemDetails = contract.items?.map((item) =>
        `${item.product?.customsName || '未知商品'}(${item.quantity}${item.product?.unit || ''}, 售价$${item.sellingPrice}, 门店:${item.store?.name || '未知'})`
      ).join(', ') || '无商品明细';
      context.push(`【销售合同${contract.contractNo}】状态:${contract.status}, 金额:$${contract.totalAmount}, 已收:$${contract.receivedAmount}\\n  商品明细: ${itemDetails}\\n  链接: /dashboard/contracts?tab=sales`);
    });
  } else if (salesKeyword && exactSales) {
    const fuzzyResult = Object.entries(byName).find(([name]) => name.startsWith('sales:fuzzy:'));
    if (fuzzyResult && fuzzyResult[1].length > 0) {
      context.push(`【提示】未找到精确匹配的\"${byName.salesKeyword}\"，但找到以下相似合同:`);
      fuzzyResult[1].forEach((contract) => {
        const itemDetails = contract.items?.map((item) =>
          `${item.product?.customsName || '未知商品'}(${item.quantity}${item.product?.unit || ''})`
        ).join(', ') || '无商品明细';
        context.push(`  - ${contract.contractNo}: $${contract.totalAmount}, 商品: ${itemDetails}`);
      });
    }
  }

  Object.entries(byName).forEach(([name, value]) => {
    if (!Array.isArray(value) || value.length === 0) {
      return;
    }

    if (name.startsWith('purchase:exact:')) {
      context.push(`【采购合同\"${name.replace('purchase:exact:', '')}\"】` + value.map((purchase) =>
        `${purchase.contractNo}(供应商:${purchase.supplier?.name || '未知'}, 金额:¥${purchase.totalAmount})`
      ).join('; '));
    }

    if (name === 'sales:recent') {
      context.push('【最近销售合同】' + value.map((s) => `${s.contractNo}(${s.supplier?.shortName || s.supplier?.name || '未知'}, ¥${s.totalAmount})`).join(', '));
    }

    if (name.startsWith('container:exact:')) {
      value.forEach((contract) => {
        const itemDetails = contract.packingItems?.map((item) =>
          `${item.product?.customsName || '未知商品'}(${item.quantity}${item.product?.unit || ''}, ${item.boxes || 0}箱)`
        ).join(', ') || '暂无装箱记录';
        context.push(`【货柜${contract.contractNo}】港口:${contract.port?.name || '未知'}, 状态:${contract.status}, 总箱数:${contract.totalBoxes}, 体积:${contract.volume}CBM\\n  装箱明细: ${itemDetails}\\n  链接: /dashboard/inventory-container?tab=container`);
      });
    }

    if (name === 'container:recent') {
      context.push('【最近货柜】');
      value.forEach((contract) => {
        const itemCount = contract.packingItems?.length || 0;
        context.push(`  - ${contract.contractNo}: ${contract.port?.name || '未知'}, ${contract.status}, ${itemCount}种商品, ${contract.totalBoxes}箱`);
      });
    }
  });

  if (byName.exchange) {
    if (typeof byName.exchange.value === 'string') {
      context.push(`【汇率配置】当前汇率${byName.exchange.value}`);
      return;
    }

    try {
      const rate = JSON.parse(byName.exchange.value);
      context.push(`【汇率配置】当前汇率${rate.rate || rate}, 缓冲值${rate.buffer || 0.2}`);
    } catch {
      context.push(`【汇率配置】当前汇率${byName.exchange.value}`);
    }
  }

  if (Array.isArray(byName.finance) && byName.finance.length === 2) {
    const [payableStats, receivableStats] = byName.finance;
    const payableTotal = payableStats?._sum?.totalAmount || 0;
    const paidTotal = payableStats?._sum?.paidAmount || 0;
    const receivableTotal = receivableStats?._sum?.totalAmount || 0;
    const receivedTotal = receivableStats?._sum?.receivedAmount || 0;
    context.push(`【财务概况】应付总额¥${payableTotal}, 已付¥${paidTotal}, 待付¥${payableTotal - paidTotal}; 应收总额$${receivableTotal}, 已收$${receivedTotal}, 待收$${receivableTotal - receivedTotal}`);
  }
};

const getDbContext = async (message) => {
  const context = [];
  const { tasks, salesKeyword } = buildContextQueries(message);
  const byName = await collectContextData(tasks);

  try {
    appendContextLines(context, byName, salesKeyword);
    if (context.length === 0) {
      return '';
    }
    return `\n\n【数据库参考信息】\n${context.join('\n')}`;
  } catch (error) {
    console.error('查询数据库上下文失败:', error.message);
    return '';
  }
};

module.exports = {
  extractKeywords,
  getDbContext,
  buildContextQueries,
};
