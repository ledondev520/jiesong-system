/**
 * Input: ?status= 查询值（archived / all / 其他）
 * Output: 归档（isActive）过滤条件：默认只列在用，archived = 「已归档」，all 不过滤
 * Pos: 供应商、门店列表共用（owner decision 13；归档复用 isActive，见 docs/operations/archive-test-data.md）
 */
const archiveFilter = (status) => (status === 'all' ? {} : { isActive: status !== 'archived' });

module.exports = { archiveFilter };
