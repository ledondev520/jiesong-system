import { describe, expect, it } from 'vitest';
import { parseFirstSectionExcerpt, parseMarkdownTableRows } from './dev-cockpit';

describe('dev-cockpit helpers', () => {
  it('parses the current task table rows', () => {
    const rows = parseMarkdownTableRows([
      '# Tasks',
      '',
      '| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |',
      '|---|---|---:|---:|---|---|',
      '| COCKPIT-01 | P0 | 90m | 1 | DOING | 落地本地项目驾驶舱 |',
      '| SH-03 | P0 | 20m | 1 | TODO | 核对运维中心入口层级 |',
      '',
    ].join('\n'));

    expect(rows).toEqual([
      {
        id: 'COCKPIT-01',
        priority: 'P0',
        estimated: '90m',
        slots: '1',
        status: 'DOING',
        task: '落地本地项目驾驶舱',
      },
      {
        id: 'SH-03',
        priority: 'P0',
        estimated: '20m',
        slots: '1',
        status: 'TODO',
        task: '核对运维中心入口层级',
      },
    ]);
  });

  it('extracts the first markdown section excerpt', () => {
    const excerpt = parseFirstSectionExcerpt([
      'intro',
      '## Round 74',
      '- item 1',
      '- item 2',
      '## Round 73',
      '- other',
    ].join('\n'), 4);

    expect(excerpt.title).toBe('Round 74');
    expect(excerpt.lines).toEqual(['## Round 74', '- item 1', '- item 2']);
  });
});
