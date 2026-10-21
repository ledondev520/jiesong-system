/**
 * Input: 临时合成 Git 仓库与合成 PR 评论，不依赖网络、gh 或前端依赖
 * Output: 标记信任、历史完整性、重命名、交叉合并及复核过期的真实回归结果
 * Pos: 本地与 CI 的 Node 工具测试，不修改全局 Git 配置，结束后清理
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parseMarker, selectLatestMarker, parseNameStatus, changedFileSets, checkReviewFreshness, runCli } = require('./check-review-freshness.cjs');

/** @param {object} t 测试上下文；@returns {object} 自动清理的本地 Git 工具。 */
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-review-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (file, content = '原始内容\n'.repeat(20)) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  };
  const commit = () => {
    git('add', '--all');
    git('-c', 'user.name=Synthetic CI test', '-c', 'user.email=ci@example.invalid', 'commit', '-qm', 'Synthetic only');
    return git('rev-parse', 'HEAD');
  };
  git('init', '-q', '--initial-branch=main');
  return { root, git, write, commit };
}

/** @param {string} head PR SHA；@param {string} base base SHA；@returns {string} 合法标记。 */
const marker = (head, base) => `review-freshness/v1 pass head=${head} base=${base}`;

/** @param {string} body 正文；@param {object} overrides 评论字段；@returns {object} 合成 issue 评论。 */
const comment = (body, overrides = {}) => ({
  id: 1, user: { login: 'synthetic-author' }, created_at: '2026-01-01T00:00:00Z', body, ...overrides,
});

/** @param {object} t 测试上下文；@param {string} file PR 改动路径；@returns {object} 分叉的 PR/base 与离线判定。 */
function reviewed(t, file = 'shared.txt') {
  const f = fixture(t);
  f.write(file);
  f.write('unrelated.txt', '无关原始内容\n');
  const base = f.commit();
  f.git('checkout', '-qb', 'pr');
  f.write(file, 'PR 修改\n' + '原始内容\n'.repeat(20));
  const head = f.commit();
  f.git('checkout', '-q', 'main');
  const metadata = {
    root: f.root, author: 'synthetic-author', owner: 'synthetic-owner', head,
    currentBase: base, comments: [comment(marker(head, base))],
  };
  const check = (overrides = {}) => checkReviewFreshness({ ...metadata, currentBase: f.git('rev-parse', 'HEAD'), ...overrides });
  return { ...f, base, head, metadata, check, file };
}

test('反例：复核后 main 修改 PR 同一文件，必须作废并列出交集', (t) => {
  const f = reviewed(t);
  f.write(f.file, 'main 修改\n');
  const currentBase = f.commit();
  const result = f.check();
  assert.equal(result.ok, false);
  assert.equal(result.rule, 'd');
  assert.deepEqual(result.intersection, [f.file]);
  assert.equal(result.base, f.base);
  assert.equal(result.currentBase, currentBase);
  assert.equal(result.head, f.head);
});

test('对照：main 仅改无关文件时通过，base 未前进也通过', (t) => {
  const f = reviewed(t);
  assert.equal(f.check().ok, true);
  f.write('unrelated.txt', 'main 无关修改\n');
  f.commit();
  const result = f.check();
  assert.equal(result.ok, true);
  assert.deepEqual(result.intersection, []);
});

test('main 将 PR 改过的文件重命名，旧新路径都进入 base 集合', (t) => {
  const f = reviewed(t);
  f.git('mv', f.file, 'new name.txt');
  const currentBase = f.commit();
  const sets = changedFileSets(f.root, f.base, currentBase, f.head);
  assert.deepEqual([...sets.baseFiles].sort(), ['new name.txt', f.file].sort());
  assert.equal(f.check().ok, false);
  assert.deepEqual(f.check().intersection, [f.file]);
});

test('PR 重命名文件而 main 改旧路径，旧路径仍有交集', (t) => {
  const f = fixture(t);
  f.write('old.txt');
  const base = f.commit();
  f.git('checkout', '-qb', 'pr');
  f.git('mv', 'old.txt', 'new.txt');
  const head = f.commit();
  f.git('checkout', '-q', 'main');
  f.write('old.txt', 'main 修改\n');
  const currentBase = f.commit();
  const result = checkReviewFreshness({
    root: f.root, author: 'synthetic-author', owner: 'synthetic-owner', head, currentBase,
    comments: [comment(marker(head, base))],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.intersection, ['old.txt']);
  assert.deepEqual([...changedFileSets(f.root, base, currentBase, head).prFiles].sort(), ['new.txt', 'old.txt']);
});

test('main 删除 PR 改过的文件，必须作废', (t) => {
  const f = reviewed(t);
  f.git('rm', f.file);
  f.commit();
  assert.equal(f.check().ok, false);
  assert.deepEqual(f.check().intersection, [f.file]);
});

test('main 改了又改回，端点无差异也必须作废', (t) => {
  const f = reviewed(t);
  f.write(f.file, '临时改动\n');
  f.commit();
  f.write(f.file);
  const currentBase = f.commit();
  assert.equal(f.git('diff', '--name-only', f.base, currentBase), '');
  assert.equal(f.check().ok, false);
  assert.deepEqual(f.check().intersection, [f.file]);
});

test('first-parent 的合并提交改动即使随后被撤销也会作废', (t) => {
  const f = reviewed(t);
  f.git('checkout', '-qb', 'other');
  f.write(f.file, '被合入的改动\n');
  f.commit();
  f.git('checkout', '-q', 'main');
  f.git('-c', 'user.name=Synthetic CI test', '-c', 'user.email=ci@example.invalid', 'merge', '--no-ff', '-qm', 'Synthetic merge', 'other');
  f.write(f.file);
  const currentBase = f.commit();
  assert.equal(f.git('diff', '--name-only', f.base, currentBase), '');
  assert.equal(f.check().ok, false);
  assert.deepEqual(f.check().intersection, [f.file]);
});

test('复制检测将未修改的源路径也纳入交集', (t) => {
  const f = reviewed(t);
  fs.copyFileSync(path.join(f.root, f.file), path.join(f.root, 'copied.txt'));
  f.commit();
  assert.equal(f.check().ok, false);
  assert.deepEqual(f.check().intersection, [f.file]);
});

test('文件名带空格、换行和制表符时仍保留完整路径', (t) => {
  const file = 'dir/space name\nnext\tline.txt';
  const f = reviewed(t, file);
  f.write(file, 'main 修改\n');
  f.commit();
  assert.equal(f.check().ok, false);
  assert.deepEqual(f.check().intersection, [file]);
});

test('标记必须独占一行、大小写与 SHA 长度严格，说明正文和首尾空白允许', () => {
  const good = marker('a'.repeat(40), 'b'.repeat(40));
  assert.deepEqual(parseMarker(`说明\r\n  ${good} \t\r\n结束`).marker, { head: 'a'.repeat(40), base: 'b'.repeat(40) });
  for (const body of [
    good.replace('v1', 'v2'), good.replace('pass', 'revoke'), good.replace('review', 'REVIEW'),
    good.replace('a'.repeat(40), 'A'.repeat(40)), good.replace('a'.repeat(40), 'a'.repeat(39)),
    good.replace('b'.repeat(40), 'b'.repeat(41)), `${good} extra`, `${good}\n${good}`,
    `${good}\nreview-freshness/v1 revoke`, `${good}\nREVIEW-FRESHNESS/v9 revoke`,
  ]) {
    assert.equal(parseMarker(body).isMarker, true, body);
    assert.equal(parseMarker(body).marker, null, body);
  }
  assert.equal(parseMarker(`文字 ${good}`).isMarker, false);
});

test('没有标记、格式错误和多行标记都作废', (t) => {
  const f = reviewed(t);
  for (const comments of [[], [comment('普通评论')], [comment('review-freshness/v1 pass head=abc base=def')], [comment(`${marker(f.head, f.base)}\n${marker(f.head, f.base)}`)]]) {
    const result = f.check({ comments });
    assert.equal(result.ok, false);
    assert.equal(result.rule, 'a');
  }
});

test('最新可信 revoke 撤销旧标记；按创建时间选择而非列表顺序或编辑时间', (t) => {
  const f = reviewed(t);
  const old = comment(marker(f.head, f.base), { updated_at: '2026-03-01T00:00:00Z' });
  const revoke = comment('REVIEW-FRESHNESS/v1 revoke', { id: 2, created_at: '2026-02-01T00:00:00Z' });
  const comments = [revoke, old];
  assert.equal(selectLatestMarker(comments, f.metadata.author, f.metadata.owner).comment.id, 2);
  assert.equal(f.check({ comments }).ok, false);
  assert.equal(f.check({ comments }).rule, 'a');
  assert.equal(f.check({ comments: [old, comment('普通较新评论', { id: 3, created_at: '2026-04-01T00:00:00Z' })] }).ok, true);
});

test('同秒评论按 ID 选最新，多行或损坏的新标记不能回退到旧标记', (t) => {
  const f = reviewed(t);
  const valid = f.metadata.comments[0];
  for (const body of ['review-freshness/v1 revoke', `${marker(f.head, f.base)}\nreview-freshness/v1 revoke`]) {
    assert.equal(f.check({ comments: [comment(body, { id: 2 }), valid] }).ok, false);
  }
});

test('非作者和 owner 的标记被忽略，更新的不可信评论不能覆盖有效标记', (t) => {
  const f = reviewed(t);
  const untrusted = comment(marker(f.head, f.base), { id: 2, user: { login: 'synthetic-other' }, created_at: '2026-02-01T00:00:00Z' });
  assert.equal(f.check({ comments: [untrusted] }).ok, false);
  assert.equal(f.check({ comments: [untrusted] }).rule, 'a');
  assert.equal(f.check({ comments: [f.metadata.comments[0], { ...untrusted, body: 'review-freshness/v1 revoke' }] }).ok, true);
});

test('仓库 owner 发的标记有效', (t) => {
  const f = reviewed(t);
  assert.equal(f.check({ comments: [comment(marker(f.head, f.base), { user: { login: f.metadata.owner } })] }).ok, true);
});

test('PR 复核后继续 push，head 不匹配则作废并保留两个 SHA', (t) => {
  const f = reviewed(t);
  f.git('checkout', '-q', 'pr');
  f.write('new.txt');
  const head = f.commit();
  const result = f.check({ head, currentBase: f.base });
  assert.equal(result.ok, false);
  assert.equal(result.rule, 'b');
  assert.equal(result.markerHead, f.head);
  assert.equal(result.head, head);
});

test('标记 base 不在本地历史、不是 commit 或不是当前 base 的祖先都作废', (t) => {
  const f = reviewed(t);
  const blob = f.git('rev-parse', `${f.base}:shared.txt`);
  for (const base of ['0'.repeat(40), blob]) {
    const result = f.check({ comments: [comment(marker(f.head, base))] });
    assert.equal(result.ok, false);
    assert.equal(result.rule, 'e');
    assert.equal(result.base, base);
  }
  const result = f.check({ comments: [comment(marker(f.head, f.head))] });
  assert.equal(result.ok, false);
  assert.equal(result.rule, 'c');
  assert.match(result.reason, /祖先/);
});

test('当前 base 缺失、PR 历史无共同祖先与损坏元数据均拒绝', (t) => {
  const f = reviewed(t);
  assert.equal(f.check({ currentBase: '0'.repeat(40) }).ok, false);
  assert.equal(f.check({ currentBase: '--invalid' }).rule, 'e');
  for (const overrides of [
    { comments: null }, { author: undefined }, { owner: '' },
    { comments: [comment(marker(f.head, f.base), { created_at: 'invalid' })] },
    { comments: [comment(marker(f.head, f.base), { user: null })] },
  ]) assert.equal(f.check(overrides).rule, 'e');
  f.git('checkout', '--orphan', 'orphan');
  f.git('rm', '-rf', '.');
  f.write('orphan.txt');
  const head = f.commit();
  assert.equal(f.check({ head, currentBase: f.base, comments: [comment(marker(head, f.base))] }).rule, 'e');
});

test('浅克隆与 Git 命令失败不能当作无改动', (t) => {
  const f = reviewed(t);
  const shallow = path.join(f.root, 'shallow');
  execFileSync('git', ['clone', '--depth=1', `file://${f.root}`, shallow], { stdio: ['ignore', 'pipe', 'pipe'] });
  const result = f.check({ root: shallow });
  assert.equal(result.ok, false);
  assert.equal(result.rule, 'e');
  assert.match(result.reason, /浅克隆/);
  assert.equal(f.check({ root: path.join(f.root, 'missing') }).rule, 'e');
});

test('NUL 文件状态解析包含重命名、复制、删除并拒绝截断输出', () => {
  assert.deepEqual([...parseNameStatus('R100\0old name\0new\nname\0C100\0source\0copy\0D\0deleted\0')], ['old name', 'new\nname', 'source', 'copy', 'deleted']);
  for (const output of ['M\0missing terminator', 'R100\0old\0', 'bad\0file\0', 'M\0\0']) {
    assert.throws(() => parseNameStatus(output));
  }
});

test('两个 merge-base 的 PR 文件集合都纳入判定', (t) => {
  const f = reviewed(t);
  // main 先合入已复核 head，此时第二个 merge-base 是 head；第一个仍保留原 PR 文件。
  f.git('merge', '--ff-only', 'pr');
  const currentBase = f.git('rev-parse', 'HEAD');
  assert.equal(f.git('diff', '--name-only', f.git('merge-base', currentBase, f.head), f.head), '');
  assert.equal(f.check().ok, false);
  assert.deepEqual(f.check().intersection, [f.file]);
});

test('当前 base 的 merge-base 可补充原始 PR diff 中没有的文件', (t) => {
  const f = fixture(t);
  f.write('shared.txt', '初始内容\n');
  const initial = f.commit();
  f.git('checkout', '-qb', 'shared-ancestor');
  f.write('shared.txt', '两侧共同祖先的改动\n');
  const shared = f.commit();
  f.git('checkout', '-qb', 'pr');
  f.write('shared.txt', '初始内容\n');
  f.write('pr-only.txt');
  const head = f.commit();
  f.git('checkout', '-q', 'main');
  f.write('main-only.txt');
  const base = f.commit();
  f.git('-c', 'user.name=Synthetic CI test', '-c', 'user.email=ci@example.invalid', 'merge', '--no-ff', '-qm', 'Synthetic merge', 'shared-ancestor');
  const currentBase = f.git('rev-parse', 'HEAD');
  assert.equal(f.git('merge-base', base, head), initial);
  assert.equal(f.git('merge-base', currentBase, head), shared);
  assert.equal(f.git('diff', '--name-only', initial, head), 'pr-only.txt');
  const result = checkReviewFreshness({
    root: f.root, author: 'synthetic-author', owner: 'synthetic-owner', head, currentBase,
    comments: [comment(marker(head, base))],
  });
  assert.equal(result.ok, false);
  assert.equal(result.rule, 'd');
  assert.deepEqual(result.intersection, ['shared.txt']);
});

test('criss-cross 的所有最佳共同祖先都须纳入 PR 文件集合', (t) => {
  const f = fixture(t);
  let serial = 0;
  const commit = (files, parents = []) => {
    // 独立构造每个树及父提交顺序，避免 Git 自动解决合并而改变测试历史。
    f.git('read-tree', '--empty');
    for (const [file, content] of Object.entries(files)) f.write(file, content);
    f.git('add', '--', ...Object.keys(files));
    const date = `2026-01-01T00:00:${String(++serial).padStart(2, '0')}Z`;
    return execFileSync('git', [
      'commit-tree', f.git('write-tree'), '-m', 'Synthetic criss-cross',
      ...parents.flatMap((parent) => ['-p', parent]),
    ], {
      cwd: f.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Synthetic CI test', GIT_AUTHOR_EMAIL: 'ci@example.invalid',
        GIT_COMMITTER_NAME: 'Synthetic CI test', GIT_COMMITTER_EMAIL: 'ci@example.invalid',
        GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date,
      },
    }).trim();
  };
  const initial = commit({ 'shared.txt': 'initial\n' });
  const y = commit({ 'shared.txt': 'changed\n' }, [initial]);
  const base = commit({ 'shared.txt': 'initial\n', 'x.txt': 'x\n' }, [initial]);
  const head = commit({ 'shared.txt': 'initial\n', 'x.txt': 'x\n', 'pr.txt': 'pr\n' }, [y, base]);
  const currentBase = commit({ 'shared.txt': 'changed\n', 'x.txt': 'x\n', 'main.txt': 'main\n' }, [base, y]);
  assert.equal(f.git('merge-base', '--all', base, head), base);
  assert.deepEqual(f.git('merge-base', '--all', currentBase, head).split('\n').sort(), [base, y].sort());
  assert.equal(f.git('diff', '--name-only', base, head), 'pr.txt');
  const result = checkReviewFreshness({
    root: f.root, author: 'synthetic-author', owner: 'synthetic-owner', head, currentBase,
    comments: [comment(marker(head, base))],
  });
  assert.equal(result.ok, false);
  assert.equal(result.rule, 'd');
  assert.ok(result.intersection.includes('shared.txt'));
});

test('CLI --help 无需 gh；参数错误以 1 退出', (t) => {
  const stdout = t.mock.method(console, 'log', () => {});
  const stderr = t.mock.method(console, 'error', () => {});
  assert.equal(runCli(['--help']), 0);
  assert.match(stdout.mock.calls[0].arguments[0], /--repo <owner\/name> --pr <N>/);
  for (const args of [[], ['--repo', 'bad'], ['--repo', 'synthetic/repo', '--pr', '0'], ['--unknown', 'x']]) {
    assert.equal(runCli(args), 1);
    assert.match(stderr.mock.calls.at(-1).arguments[0], /规则 e/);
  }
});
