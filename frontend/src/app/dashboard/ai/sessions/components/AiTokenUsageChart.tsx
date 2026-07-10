/**
 * Input: AI Token 日序列、模型清单与统计区间
 * Output: AI 用量多模型趋势图
 * Pos: AI 会话页面延迟加载的内部图表 Module，隔离 recharts 与日期格式化实现
 */

'use client';

import { format } from 'date-fns';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const MODEL_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#14b8a6',
];

const SHANGHAI_HOUR_BUCKET = /^(\d{4}-\d{2}-\d{2}) (\d{2}):00$/;

const parseShanghaiHourBucket = (value: string): Date | null => {
  const match = value.match(SHANGHAI_HOUR_BUCKET);
  if (!match) return null;
  return new Date(`${match[1]}T${match[2]}:00:00+08:00`);
};

const formatChartXTick = (value: string, statsDays: string) => {
  if (statsDays === '1') {
    const date = parseShanghaiHourBucket(value);
    if (date) return format(date, 'HH:mm');
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    try {
      return format(new Date(`${value}T12:00:00+08:00`), 'M/d');
    } catch {
      return value;
    }
  }
  return value;
};

const formatChartTooltipLabel = (value: string, statsDays: string) => {
  if (statsDays === '1') {
    const date = parseShanghaiHourBucket(value);
    if (date) return `${format(date, 'M/d HH:mm')}（北京时间）`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    try {
      const date = new Date(`${value}T12:00:00+08:00`);
      return `${format(date, 'yyyy-MM-dd')}（北京时间·按日）`;
    } catch {
      return value;
    }
  }
  return value;
};

const formatTokens = (tokens: number) => {
  if (!tokens) return '—';
  if (tokens < 1000) return String(tokens);
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)} K`;
  return `${(tokens / 1_000_000).toFixed(3)} M`;
};

interface AiTokenUsageChartProps {
  data: Array<Record<string, string | number>>;
  models: string[];
  statsDays: string;
}

export default function AiTokenUsageChart({ data, models, statsDays }: AiTokenUsageChartProps) {
  return (
    <div data-testid="ai-token-usage-chart">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11 }}
            minTickGap={statsDays === '1' ? 16 : 8}
            tickFormatter={(value: string) => formatChartXTick(value, statsDays)}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}K` : String(value)}
          />
          <Tooltip
            labelFormatter={(label) => formatChartTooltipLabel(String(label), statsDays)}
            formatter={(value, name) => [
              formatTokens(typeof value === 'number' ? value : Number(value ?? 0)),
              String(name),
            ]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {models.map((model, index) => (
            <Line
              key={model}
              type="monotone"
              dataKey={model}
              stroke={MODEL_COLORS[index % MODEL_COLORS.length]}
              strokeWidth={2}
              dot={false}
              name={model}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
