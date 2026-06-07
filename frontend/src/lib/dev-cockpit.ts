import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

interface DevFileChange {
  status: string;
  path: string;
}

export interface DevTaskRow {
  id: string;
  priority: string;
  estimated: string;
  slots: string;
  status: string;
  task: string;
}

export interface DevSectionExcerpt {
  title: string;
  lines: string[];
}

export interface DevCockpitSnapshot {
  generatedAt: string;
  repoRoot: string;
  branch: string;
  head: string;
  dirty: boolean;
  statusLines: string[];
  changedFiles: DevFileChange[];
  diffStatLines: string[];
  taskRows: DevTaskRow[];
  openTasks: DevTaskRow[];
  taskDoneCount: number;
  taskTodoCount: number;
  planExcerpt: DevSectionExcerpt;
  metricsExcerpt: DevSectionExcerpt;
}

const REPO_MARKERS = ['PLAN.md', 'TASKS.md', 'METRICS.md', 'frontend', 'backend'];

const readTextFile = (filePath: string) => readFileSync(filePath, 'utf8');

const runGit = (repoRoot: string, args: string[]) =>
  execFileSync('git', ['-C', repoRoot, ...args], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  }).trim();

export const resolveRepoRoot = () => {
  const candidates = [path.resolve(process.cwd(), '..'), process.cwd()];

  for (const candidate of candidates) {
    if (REPO_MARKERS.every((marker) => existsSync(path.join(candidate, marker)))) {
      return candidate;
    }
  }

  return path.resolve(process.cwd(), '..');
};

export const parseMarkdownTableRows = (markdown: string): DevTaskRow[] => {
  const lines = markdown.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.startsWith('| ID |'));

  if (headerIndex < 0) {
    return [];
  }

  const rows: DevTaskRow[] = [];

  for (let index = headerIndex + 2; index < lines.length; index += 1) {
    const line = lines[index].trim();

    if (!line.startsWith('|')) {
      break;
    }

    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());

    if (cells.length < 6) {
      continue;
    }

    rows.push({
      id: cells[0],
      priority: cells[1],
      estimated: cells[2],
      slots: cells[3],
      status: cells[4],
      task: cells[5],
    });
  }

  return rows;
};

export const parseFirstSectionExcerpt = (markdown: string, maxLines = 12): DevSectionExcerpt => {
  const lines = markdown.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.startsWith('## '));

  if (startIndex < 0) {
    return { title: '未找到章节', lines: [] };
  }

  const excerptLines: string[] = [];

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    if (index > startIndex && line.startsWith('## ')) {
      break;
    }

    excerptLines.push(line);

    if (excerptLines.length >= maxLines) {
      break;
    }
  }

  return {
    title: lines[startIndex].replace(/^##\s*/, '').trim(),
    lines: excerptLines,
  };
};

const parseGitStatus = (gitStatus: string) =>
  gitStatus
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => ({
      status: line.slice(0, 2).trim() || line.slice(0, 2),
      path: line.slice(3).trim(),
    }));

export const getDevCockpitSnapshot = (): DevCockpitSnapshot => {
  const repoRoot = resolveRepoRoot();
  const tasksMarkdown = readTextFile(path.join(repoRoot, 'TASKS.md'));
  const planMarkdown = readTextFile(path.join(repoRoot, 'PLAN.md'));
  const metricsMarkdown = readTextFile(path.join(repoRoot, 'METRICS.md'));

  let branch = 'unknown';
  let head = 'unknown';
  let statusShort = '';
  let diffStat = '';

  try {
    branch = runGit(repoRoot, ['branch', '--show-current']) || 'unknown';
    head = runGit(repoRoot, ['rev-parse', '--short', 'HEAD']) || 'unknown';
    statusShort = runGit(repoRoot, ['status', '--short']);
    diffStat = runGit(repoRoot, ['diff', '--stat']);
  } catch (error) {
    console.error('读取本地 Git 状态失败:', error);
  }

  const taskRows = parseMarkdownTableRows(tasksMarkdown);
  const openTasks = taskRows.filter((row) => row.status === 'TODO' || row.status === 'DOING');
  const taskDoneCount = taskRows.filter((row) => row.status === 'DONE').length;
  const taskTodoCount = openTasks.length;

  return {
    generatedAt: new Date().toISOString(),
    repoRoot,
    branch,
    head,
    dirty: statusShort.length > 0,
    statusLines: parseGitStatus(statusShort).map((entry) => `${entry.status} ${entry.path}`),
    changedFiles: parseGitStatus(statusShort),
    diffStatLines: diffStat ? diffStat.split(/\r?\n/).filter(Boolean) : [],
    taskRows,
    openTasks,
    taskDoneCount,
    taskTodoCount,
    planExcerpt: parseFirstSectionExcerpt(planMarkdown, 12),
    metricsExcerpt: parseFirstSectionExcerpt(metricsMarkdown, 12),
  };
};
