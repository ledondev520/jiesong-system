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
    ContractTemplate: '合同模板',
    PurchaseContract: '采购合同',
    SalesContract: '出口合同',
    Supplier: '供应商',
    Product: '商品',
    User: '用户',
    SystemConfig: '系统配置',
    DataImport: '数据导入',
    DataExport: '数据导出',
    Container: '货柜',
    Payment: '收付款',
    TaxRefund: '出口退税',
    CustomsDeclaration: '报关单',
    ChatSession: 'AI 会话',
    Inventory: '库存',
    OpsExecution: '经营执行',
    Notification: '通知',
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

/**
 * 职责：将旧值/新值 JSON 转为可读摘要句（按实体定制）
 * 思路：仅对已知结构格式化；否则仍展示原文并由调用方附带「原始数据」说明
 */
export function describeLogValues(log: {
  entity?: string | null;
  action?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
}): { hints: string[] } {
  const hints: string[] = [];
  const nv = tryParseJson(log.newValue ?? undefined);

  // 1. 门店采购建议：生成接口摘要（见 backend storeRecommend.js getNewValue）
  if (log.entity === 'StoreRecommend' && log.action === 'GENERATE' && nv && typeof nv === 'object') {
    const o = nv as Record<string, unknown>;
    const sid = o.storeId;
    const storePart =
      sid === null || sid === undefined ? '未指定门店' : `门店 ID：${String(sid)}`;
    const reqLines =
      typeof o.requestedItems === 'number' ? `${o.requestedItems} 行` : '—';
    const out =
      typeof o.resultCount === 'number' ? `${o.resultCount} 条` : '—';
    hints.push(`【生成采购建议】${storePart}；请求携带商品明细 ${reqLines}；接口返回推荐 ${out}。`);
  }

  // 2. 合同文件：由采购合同生成购销合同（见 contractDoc.js）
  if (log.entity === 'ContractFile' && log.action === 'GENERATE' && nv && typeof nv === 'object') {
    const o = nv as Record<string, unknown>;
    const pid = o.purchaseContractId ?? '—';
    const sn = o.storeName != null && o.storeName !== '' ? String(o.storeName) : '—';
    hints.push(`【生成合同文件】采购合同 ID：${pid}；门店名称：${sn}。`);
  }

  return { hints };
}
