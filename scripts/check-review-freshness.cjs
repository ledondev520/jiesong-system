/**
 * Input: GitHub PR 元数据与全部 issue 评论、origin 的完整 Git 历史
 * Output: 复核仍有效时退出 0，否则退出 1 并说明规则、SHA 与交集文件
 * Pos: 本地合并前与 CI 共用的复核时效门禁；Node 20，无第三方依赖
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const { execFileSync } = require('node:child_process');

const SHA = /^[a-f0-9]{40}$/;
const MARKER = /^review-freshness\/v1 pass head=([a-f0-9]{40}) base=([a-f0-9]{40})$/;

/** @param {string} command 命令名；@param {string[]} args 参数；@param {string} root 工作目录；@returns {string} 原始输出。 */
function execute(command, args, root) {
  try {
    return execFileSync(command, args, {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120000, maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    // 不输出子进程 stderr，避免凭据或本地配置出现在诊断中。
    const failure = new Error(`${command} ${JSON.stringify(args)} 失败（${error.code || error.status || '未知状态'}）`);
    failure.status = error.status;
    throw failure;
  }
}

const git = (root, args) => execute('git', args, root);

/**
 * 仅标记前缀忽略大小写；正文可有说明，但标记必须独占一行且仅出现一次。
 * @param {string} body 评论正文
 * @returns {{isMarker: boolean, marker: object|null}} 标记评论及合法内容
 */
function parseMarker(body) {
  if (typeof body !== 'string') throw new Error('评论正文缺失或不是字符串');
  const lines = body.split('\n').map((line) => line.trim()).filter((line) => /^review-freshness\//i.test(line));
  const match = lines.length === 1 ? MARKER.exec(lines[0]) : null;
  return { isMarker: lines.length > 0, marker: match ? { head: match[1], base: match[2] } : null };
}

/**
 * 按创建时间选最新可信标记评论，格式错误也覆盖旧标记；同秒按评论 ID 排序。
 * @param {object[]} comments 全部分页的 issue 评论
 * @param {string} author PR 作者 login
 * @param {string} owner 仓库 owner login
 * @returns {object|null} 最新评论及其解析结果；无可信标记时为 null
 */
function selectLatestMarker(comments, author, owner) {
  if (!Array.isArray(comments) || ![author, owner].every((value) => typeof value === 'string' && value.length)) {
    throw new Error('缺少全部评论、PR 作者或仓库 owner');
  }
  const trusted = new Set([author.toLowerCase(), owner.toLowerCase()]);
  let latest = null;
  for (const comment of comments) {
    if (!comment || typeof comment.user?.login !== 'string') throw new Error('评论作者信息缺失');
    if (!trusted.has(comment.user.login.toLowerCase())) continue;
    const parsed = parseMarker(comment.body);
    if (!parsed.isMarker) continue;
    const time = typeof comment.created_at === 'string' ? Date.parse(comment.created_at) : NaN;
    if (!Number.isFinite(time) || !Number.isSafeInteger(comment.id) || comment.id <= 0) {
      throw new Error('可信标记评论缺少创建时间或有效 ID');
    }
    if (!latest || time > latest.time || (time === latest.time && comment.id > latest.comment.id)) {
      latest = { comment, marker: parsed.marker, time };
    }
  }
  return latest;
}

/**
 * 解析 --name-status -z；R/C 的旧、新路径都保留，删除保留旧路径。
 * @param {string} output Git 的 NUL 分隔输出
 * @returns {Set<string>} 未按行切割或去空白的路径集合
 */
function parseNameStatus(output) {
  const files = new Set();
  if (output === '') return files;
  const tokens = output.split('\0');
  if (tokens.pop() !== '') throw new Error('Git 文件列表缺少 NUL 结束符');
  for (let i = 0; i < tokens.length;) {
    const status = tokens[i++];
    if (!/^(?:[ADMTUXB]|[RC][0-9]{1,3}|M[0-9]{1,3})$/.test(status)) throw new Error('Git 文件状态格式错误');
    const count = /^[RC]/.test(status) ? 2 : 1;
    for (let n = 0; n < count; n++) {
      const file = tokens[i++];
      if (!file) throw new Error('Git 文件列表不完整');
      files.add(file);
    }
  }
  return files;
}

/** @param {string} root 仓库；@param {string} sha 完整 SHA；@returns {void} 拒绝缺失对象和非 commit。 */
function assertCommit(root, sha) {
  if (!SHA.test(sha || '') || git(root, ['cat-file', '-t', sha]).trim() !== 'commit') {
    throw new Error(`不是本地历史中的 commit：${sha}`);
  }
}

/**
 * 端点 diff 加每个 first-parent 提交，保留被撤销的改动；PR 取两个 merge-base 的并集。
 * @param {string} root 完整历史仓库
 * @param {string} base 标记 base（B0）
 * @param {string} currentBase 当前 base（B1）
 * @param {string} head PR head（H）
 * @returns {{baseFiles: Set<string>, prFiles: Set<string>}} 两侧文件集合
 * @throws 任意 Git/解析失败；调用者须先验证 SHA、完整历史及祖先关系
 */
function changedFileSets(root, base, currentBase, head) {
  const diff = (from, to) => parseNameStatus(git(root, [
    'diff', '--no-ext-diff', '--no-textconv', '--name-status', '-z',
    '--find-renames', '--find-copies', '--find-copies-harder', '-l0', from, to, '--',
  ]));
  const baseFiles = diff(base, currentBase);
  const commits = git(root, ['rev-list', '--first-parent', `${base}..${currentBase}`]).trim();
  for (const commit of commits ? commits.split('\n') : []) {
    const parent = git(root, ['rev-parse', '--verify', `${commit}^1`]).trim();
    for (const file of diff(parent, commit)) baseFiles.add(file);
  }
  const prFiles = new Set();
  for (const tip of [base, currentBase]) {
    const ancestor = git(root, ['merge-base', tip, head]).trim();
    for (const file of diff(ancestor, head)) prFiles.add(file);
  }
  return { baseFiles, prFiles };
}

/**
 * 离线判定入口：只读本地 Git 和传入元数据，不调用 gh、不 fetch、不修改仓库。
 * @param {object} options root、author、owner、head、currentBase、全部 comments（含标记）
 * @returns {object} ok、rule、reason、相关 SHA、intersection；异常按规则 e 拒绝
 */
function checkReviewFreshness({ root, author, owner, head, currentBase, comments }) {
  const context = { head, currentBase, base: null, intersection: [] };
  const result = (ok, rule, reason) => ({ ...context, ok, rule, reason });
  try {
    const latest = selectLatestMarker(comments, author, owner);
    if (!latest) return result(false, 'a', '没有可信作者的复核标记');
    if (!latest.marker) return result(false, 'a', `最新评论 ${latest.comment.id} 的标记无效：须恰好一行合法标记（含 revoke 的评论会撤销旧标记）`);
    const marker = latest.marker;
    context.base = marker.base;
    context.markerHead = marker.head;
    if (!SHA.test(head || '') || !SHA.test(currentBase || '')) throw new Error('当前 head/base SHA 格式错误');
    if (head !== marker.head) return result(false, 'b', '当前 PR head 与复核时 head 不一致');
    if (git(root, ['rev-parse', '--is-shallow-repository']).trim() !== 'false') throw new Error('浅克隆不能判定，请使用 fetch-depth: 0 的完整历史');
    for (const sha of [marker.base, currentBase, head]) assertCommit(root, sha);
    // --is-ancestor 返回 1 表示非祖先，其他错误交由异常路径拒绝。
    try {
      git(root, ['merge-base', '--is-ancestor', marker.base, currentBase]);
    } catch (error) {
      if (error.status !== 1) throw error;
      return result(false, 'c', '标记 base 不是当前 base 的祖先');
    }
    const { baseFiles, prFiles } = changedFileSets(root, marker.base, currentBase, head);
    context.intersection = [...baseFiles].filter((file) => prFiles.has(file)).sort();
    if (context.intersection.length) return result(false, 'd', '复核后 base 改动碰到了 PR 文件，必须更新分支、重跑 CI 并重新独立复核');
    return result(true, 'pass', '复核标记有效，base 后续改动与 PR 文件无交集');
  } catch (error) {
    return result(false, 'e', `信息不足：${error.message}`);
  }
}

/**
 * 在线入口依赖已认证的 gh、git 和指向目标仓库的 origin；只在此入口 fetch。
 * @param {string[]} args CLI 参数
 * @param {string} root 本地仓库目录
 * @returns {number} 退出码
 */
function runCli(args, root = process.cwd()) {
  const usage = '用法：node scripts/check-review-freshness.cjs --repo <owner/name> --pr <N>\n需要已认证的 gh、git、origin 和完整 Git 历史；合并前及 CI 使用同一命令。';
  if (args.length === 1 && args[0] === '--help') {
    console.log(usage);
    return 0;
  }
  try {
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i];
      if (!['--repo', '--pr'].includes(key) || options[key] !== undefined || !args[i + 1]) throw new Error(usage);
      options[key] = args[i + 1];
    }
    const repo = options['--repo'];
    const pr = options['--pr'];
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo || '') || !/^[1-9][0-9]*$/.test(pr || '')) throw new Error(usage);
    const api = (endpoint, extra = []) => {
      const response = execute('gh', ['api', endpoint, ...extra], root);
      try {
        return JSON.parse(response);
      } catch {
        throw new Error(`GitHub API JSON 解析失败：${endpoint}`);
      }
    };
    const metadata = api(`repos/${repo}/pulls/${pr}`);
    const repository = api(`repos/${repo}`);
    const pages = api(`repos/${repo}/issues/${pr}/comments?per_page=100`, ['--paginate', '--slurp']);
    if (!Array.isArray(pages) || !pages.every(Array.isArray)) throw new Error('评论分页响应格式错误');
    const baseName = metadata.base?.ref;
    if (typeof baseName !== 'string' || !baseName) throw new Error('PR base 分支名缺失');
    const currentBase = api(`repos/${repo}/git/ref/heads/${encodeURIComponent(baseName)}`).object?.sha;
    const head = metadata.head?.sha;
    if (![head, currentBase].every((sha) => typeof sha === 'string' && SHA.test(sha))) throw new Error('API head/base SHA 格式错误');
    if (git(root, ['rev-parse', '--is-shallow-repository']).trim() !== 'false') throw new Error('浅克隆不能判定，请使用 fetch-depth: 0 的完整历史');
    git(root, ['fetch', '--no-tags', 'origin', head, currentBase]);
    const verdict = checkReviewFreshness({
      root, head, currentBase, author: metadata.user?.login, owner: repository.owner?.login, comments: pages.flat(),
    });
    // JSON 转义特殊文件名，避免换行路径破坏结论与交集清单。
    console.log(`${verdict.ok ? '通过' : '作废'} [规则 ${verdict.rule}] ${verdict.reason}；head=${head} markerHead=${verdict.markerHead || '无'} B0=${verdict.base || '无'} B1=${currentBase}；交集=${JSON.stringify(verdict.intersection)}`);
    return verdict.ok ? 0 : 1;
  } catch (error) {
    console.error(`作废 [规则 e] ${error.message}`);
    return 1;
  }
}

if (require.main === module) process.exitCode = runCli(process.argv.slice(2));

module.exports = { parseMarker, selectLatestMarker, parseNameStatus, changedFileSets, checkReviewFreshness, runCli };
