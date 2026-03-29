/**
 * Input: Agent 管理请求
 * Output: Agent 账号与凭证管理响应
 * Pos: Agent 管理控制器
 */

const { created, paginated, success } = require('../utils/response');
const { normalizePagination } = require('../utils/pagination');
const agentAccountService = require('../services/agentAccountService');

const list = async (req, res, next) => {
  try {
    const { page, pageSize } = normalizePagination(req.query, { pageSize: 20, maxPageSize: 100 });
    const result = await agentAccountService.listAgentAccounts({ page, pageSize });
    paginated(res, result.items, result.total, page, pageSize);
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const record = await agentAccountService.getAgentAccountById({ id: req.params.id });
    success(res, record);
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const record = await agentAccountService.createAgentAccount({ input: req.body });
    created(res, record, 'Agent 账号创建成功');
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const record = await agentAccountService.updateAgentAccount({ id: req.params.id, input: req.body });
    success(res, record, 'Agent 账号更新成功');
  } catch (error) {
    next(error);
  }
};

const issueCredential = async (req, res, next) => {
  try {
    const result = await agentAccountService.issueAgentCredential({
      agentAccountId: req.params.id,
      label: req.body?.label,
      expiresInDays: req.body?.expiresInDays,
    });
    created(res, result, 'Agent 凭证签发成功');
  } catch (error) {
    next(error);
  }
};

const revokeCredential = async (req, res, next) => {
  try {
    const result = await agentAccountService.revokeAgentCredential({
      credentialId: req.params.credentialId,
    });
    success(res, result, 'Agent 凭证已吊销');
  } catch (error) {
    next(error);
  }
};

const rotateCredential = async (req, res, next) => {
  try {
    const result = await agentAccountService.rotateAgentCredential({
      credentialId: req.params.credentialId,
      expiresInDays: req.body?.expiresInDays,
    });
    created(res, result, 'Agent 凭证已轮换');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  list,
  getById,
  create,
  update,
  issueCredential,
  revokeCredential,
  rotateCredential,
};
