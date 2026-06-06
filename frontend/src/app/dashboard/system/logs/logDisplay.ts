/**
 * Input: 操作日志原始字段（action / entity / oldValue / newValue）
 * Output: 中文标签与可读摘要，降低运维查看成本
 * Pos: 系统日志页展示辅助
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

/** 职责：审计动作代码 → 简短中文（未知则回退原文） */
export function labelForAction(action: string | null | undefined): string {
  if (!action) return '-';
  const map: Record<string, string> = {
    CREATE: '新建',
    UPDATE: '修改',
    DELETE: '删除',
    GENERATE: '生成',
    UPLOAD: '上传',
    IMPORT: '导入',
    EXPORT: '导出',
    LOGIN: '登录',
    LOGOUT: '登出',
  };
  return map[action] ?? action;
}

/** 职责：实体代码 → 业务名称（未知则回退原文） */
export function labelForEntity(entity: string | null | undefined): string {
  if (!entity) return '-';
  const map: Record<string, string> = {
    StoreRecommend: '门店采购建议',
    ContractFile: '合同文件',
    SalesContractFile: '出口合同文件',
    ContractTemplate: '合同模板',
    PurchaseContract: '采购合同',
    PurchaseItem: '采购明细',
    SalesContract: '销售合同',
    SalesItem: '销售明细',
    Supplier: '供应商',
    SupplierAlias: '供应商别名',
    Product: '商品',
    ProductSupplier: '商品供应商',
    PriceHistory: '商品价格历史',
    ProductCategory: '商品分类',
    User: '用户',
    SystemConfig: '系统配置',
    DataImport: '数据导入',
    DataExport: '数据导出',
    Container: '货柜',
    ContainerItem: '货柜明细',
    PackingItem: '装箱项目',
    Payment: '收付款',
    TaxRefund: '出口退税',
    TaxRate: '税率',
    ForexVerification: '外汇核销',
    CustomsDeclaration: '报关单',
    ChatSession: 'AI 会话',
    Inventory: '库存',
    OpsExecution: '经营执行',
    OpsExecutionPurchaseTemplate: '经营执行采购模板',
    Notification: '通知',
    Store: '门店',
    Port: '港口',
  };
  return map[entity] ?? entity;
}

const tryParseJson = (raw: string | null | undefined): unknown => {
  if (!raw || typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** 职责：从记录对象中提取主要显示名称（按常见字段优先级） */
function extractName(obj: Record<string, unknown>): string | null {
  const candidates = [
    'name', 'title', 'username', 'email',
    'contractNo', 'declarationNo', 'containerNo',
    'storeName', 'supplierName', 'productName',
    'key', 'id',
  ] as const;
  for (const key of candidates) {
    const val = obj[key];
    if (val != null && val !== '') return String(val);
  }
  return null;
}

/** 职责：金额 + 货币格式化 */
function fmtAmount(obj: Record<string, unknown>): string | null {
  const amount = obj.amount ?? obj.totalAmount ?? obj.invoiceAmount;
  const currency = obj.currency ?? obj.currencyCode ?? '';
  if (amount == null) return null;
  const amtStr = typeof amount === 'number' ? amount.toLocaleString() : String(amount);
  return currency ? `${amtStr} ${currency}` : amtStr;
}

/**
 * 职责：将旧值/新值 JSON 转为可读摘要句（按实体定制）
 * 思路：
 *  1. 有实体专属格式化逻辑的，走专属分支
 *  2. 其余实体走通用格式化：动作 + 实体名 + 主名称
 *  3. 完全无法识别时，返回空 hints（由调用方显示原始数据）
 */
export function describeLogValues(log: {
  entity?: string | null;
  action?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
}): { hints: string[] } {
  const hints: string[] = [];
  const nv = tryParseJson(log.newValue ?? undefined);
  const ov = tryParseJson(log.oldValue ?? undefined);
  const entityLabel = labelForEntity(log.entity);
  const actionLabel = labelForAction(log.action);
  const nvObj = nv && typeof nv === 'object' ? (nv as Record<string, unknown>) : null;
  const ovObj = ov && typeof ov === 'object' ? (ov as Record<string, unknown>) : null;
  const refObj = nvObj ?? ovObj;

  // ── 专属：门店采购建议（生成接口摘要） ──────────────────────────────
  if (log.entity === 'StoreRecommend' && log.action === 'GENERATE' && nvObj) {
    const sid = nvObj.storeId;
    const storePart = sid == null ? '未指定门店' : `门店 ID：${String(sid)}`;
    const reqLines = typeof nvObj.requestedItems === 'number' ? `${nvObj.requestedItems} 行` : '—';
    const out = typeof nvObj.resultCount === 'number' ? `${nvObj.resultCount} 条` : '—';
    hints.push(`【生成采购建议】${storePart}；请求携带商品明细 ${reqLines}；接口返回推荐 ${out}。`);
    return { hints };
  }

  // ── 专属：合同文件（由采购合同生成购销合同） ───────────────────────
  if (log.entity === 'ContractFile' && log.action === 'GENERATE' && nvObj) {
    const pid = nvObj.purchaseContractId ?? '—';
    const sn = nvObj.storeName != null && nvObj.storeName !== '' ? String(nvObj.storeName) : '—';
    hints.push(`【生成合同文件】采购合同 ID：${pid}；门店名称：${sn}。`);
    return { hints };
  }

  // ── 专属：用户登录/登出 ────────────────────────────────────────────
  if (log.entity === 'User' && (log.action === 'LOGIN' || log.action === 'LOGOUT')) {
    hints.push(log.action === 'LOGIN' ? '用户登录系统。' : '用户退出登录。');
    return { hints };
  }

  // ── 专属：系统配置修改 ────────────────────────────────────────────
  if (log.entity === 'SystemConfig' && log.action === 'UPDATE' && nvObj) {
    const keys = Object.keys(nvObj).filter((k) => k !== 'id' && k !== 'updatedAt');
    if (keys.length > 0) {
      const keyList = keys.slice(0, 5).join('、');
      const more = keys.length > 5 ? `等 ${keys.length} 项` : '';
      hints.push(`修改了系统配置项：${keyList}${more}。`);
    } else {
      hints.push('修改了系统配置。');
    }
    return { hints };
  }

  // ── 专属：数据导入 ───────────────────────────────────────────────
  if (log.entity === 'DataImport' && nvObj) {
    const type = nvObj.type ?? nvObj.dataType ?? '—';
    const count = nvObj.count ?? nvObj.rowCount ?? nvObj.totalRows;
    const countStr = count != null ? `共 ${count} 条` : '';
    hints.push(`导入数据（类型：${type}）${countStr}。`);
    return { hints };
  }

  // ── 专属：数据导出 ───────────────────────────────────────────────
  if (log.entity === 'DataExport' && nvObj) {
    const type = nvObj.type ?? nvObj.dataType ?? '—';
    hints.push(`导出数据（类型：${type}）。`);
    return { hints };
  }

  // ── 通用：提取主名称，生成人类可读的一句话 ────────────────────────
  if (refObj) {
    const displayName = extractName(refObj);
    const amtStr = fmtAmount(refObj);

    let sentence = `${actionLabel}${entityLabel}`;
    if (displayName) sentence += `「${displayName}」`;
    if (amtStr) sentence += `，金额：${amtStr}`;
    sentence += '。';
    hints.push(sentence);

    // 对 UPDATE，额外显示字段变更摘要
    if (log.action === 'UPDATE' && nvObj && ovObj) {
      const changedKeys = Object.keys(nvObj).filter(
        (k) => k !== 'id' && k !== 'updatedAt' && k !== 'createdAt'
          && JSON.stringify(nvObj[k]) !== JSON.stringify(ovObj[k]),
      );
      if (changedKeys.length > 0 && changedKeys.length <= 6) {
        const keyList = changedKeys.slice(0, 6).join('、');
        hints.push(`变更字段：${keyList}。`);
      } else if (changedKeys.length > 6) {
        hints.push(`共 ${changedKeys.length} 个字段发生变更。`);
      }
    }
  }

  return { hints };
}
