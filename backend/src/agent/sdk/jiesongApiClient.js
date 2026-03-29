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

  async searchEntities({ query, types, limit }) {
    return this.request('/api/v1/search', {
      query: {
        q: query,
        types: Array.isArray(types) ? types.join(',') : types,
        limit,
      },
    });
  }

  async createPurchase(input) {
    return this.request('/api/v1/purchases', {
      method: 'POST',
      body: input,
    });
  }

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

  async updatePurchase(id, input) {
    return this.request(`/api/v1/purchases/${id}`, {
      method: 'PUT',
      body: input,
    });
  }
}

module.exports = {
  JiesongApiClient,
  JiesongApiError,
};
