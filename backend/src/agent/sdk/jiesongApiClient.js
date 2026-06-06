/**
 * Input: baseUrl / agent token / fetch
 * Output: 面向 CLI 和 MCP 的 HTTP SDK
 * Pos: Agent 远程访问系统的统一客户端
 */

class JiesongApiError extends Error {
  constructor(message, { status = 500, code = status, data = null } = {}) {
    super(message);
    this.name = 'JiesongApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

class JiesongApiClient {
  constructor({ baseUrl, token, fetchImpl = fetch }) {
    if (!baseUrl) {
      throw new TypeError('baseUrl 不能为空');
    }
    if (!token) {
      throw new TypeError('token 不能为空');
    }
    this.baseUrl = String(baseUrl).replace(/\/+$/, '');
    this.token = token;
    this.fetchImpl = fetchImpl;
  }

  async request(path, { method = 'GET', query, body } = {}) {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query && typeof query === 'object') {
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        url.searchParams.set(key, String(value));
      });
    }

    const response = await this.fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok || (payload && payload.code >= 400)) {
      throw new JiesongApiError(
        payload?.message || `请求失败 (${response.status})`,
        {
          status: response.status,
          code: payload?.code || response.status,
          data: payload?.data || null,
        }
      );
    }

    return payload?.data ?? payload;
  }

  // ── 统一搜索 ──
  async searchEntities({ query, types, limit }) {
    return this.request('/api/v1/search', {
      query: {
        q: query,
        types: Array.isArray(types) ? types.join(',') : types,
        limit,
      },
    });
  }

  // ── 采购 ──
  async createPurchase(input) {
    return this.request('/api/v1/purchases', {
      method: 'POST',
      body: input,
    });
  }

  async updatePurchase(id, input) {
    return this.request(`/api/v1/purchases/${id}`, {
      method: 'PUT',
      body: input,
    });
  }

  // ── 供应商 ──
  async createSupplier(input) {
    return this.request('/api/v1/suppliers', {
      method: 'POST',
      body: input,
    });
  }

  async updateSupplier(id, input) {
    return this.request(`/api/v1/suppliers/${id}`, {
      method: 'PUT',
      body: input,
    });
  }

  // ── 销售/出口 ──
  async listSalesContracts({ status, storeId, keyword, page = 1, pageSize = 20 } = {}) {
    return this.request('/api/v1/sales', {
      query: { status, storeId, keyword, page, pageSize },
    });
  }

  async getSalesContractById(id) {
    return this.request(`/api/v1/sales/${id}`);
  }

  // ── 库存 ──
  async listInventories({ status, productId, keyword, page = 1, pageSize = 20 } = {}) {
    return this.request('/api/v1/inventory', {
      query: { status, productId, keyword, page, pageSize },
    });
  }

  // ── 财务 ──
  async listPayments({ type, page = 1, pageSize = 20 } = {}) {
    return this.request('/api/v1/finance/payments', {
      query: { type, page, pageSize },
    });
  }

  async getPayables({ page = 1, pageSize = 20 } = {}) {
    return this.request('/api/v1/finance/payables', {
      query: { page, pageSize },
    });
  }

  async getReceivables({ page = 1, pageSize = 20, overdueDays } = {}) {
    return this.request('/api/v1/finance/receivables', {
      query: { page, pageSize, overdueDays },
    });
  }

  // ── 报关 ──
  async listCustomsDeclarations({ salesContractId, page = 1, pageSize = 20 } = {}) {
    return this.request('/api/v1/customs-declarations', {
      query: { salesContractId, page, pageSize },
    });
  }

  // ── Dashboard ──
  async getDashboardAnalytics() {
    return this.request('/api/v1/dashboard/analytics');
  }

  // ── Agent 运行时 ──
  async agentPrompt({ message, agentType = 'unified', sessionId }) {
    return this.request('/api/v1/ai/agents/prompt', {
      method: 'POST',
      body: { message, agentType, sessionId },
    });
  }

  async getAgentTools() {
    return this.request('/api/v1/ai/agents/tools');
  }
}

module.exports = {
  JiesongApiClient,
  JiesongApiError,
};
