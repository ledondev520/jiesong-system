/**
 * Input: label, value, icon, trend data, color theme, onClick
 * Output: Bento-style KPI card with Sparkline micro-chart
 * Pos: Dashboard KPI grid
 */

'use client';

import { motion } from 'framer-motion';
import { type LucideIcon } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { value: number }[];
  color?: 'blue' | 'green' | 'amber' | 'rose' | 'violet';
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  pulse?: boolean;
}

const colorMap = {
  blue: {
    bg: 'bg-blue-500/8',
    text: 'text-blue-500',
    ring: 'ring-blue-500/12',
    stroke: '#3b82f6',
    fill: 'rgba(59,130,246,0.15)',
    hover: 'hover:border-blue-500/30',
  },
  green: {
    bg: 'bg-emerald-500/8',
    text: 'text-emerald-500',
    ring: 'ring-emerald-500/12',
    stroke: '#10b981',
    fill: 'rgba(16,185,129,0.15)',
    hover: 'hover:border-emerald-500/30',
  },
  amber: {
    bg: 'bg-amber-500/8',
    text: 'text-amber-500',
    ring: 'ring-amber-500/12',
    stroke: '#f59e0b',
    fill: 'rgba(245,158,11,0.15)',
    hover: 'hover:border-amber-500/30',
  },
  rose: {
    bg: 'bg-rose-500/8',
    text: 'text-rose-500',
    ring: 'ring-rose-500/12',
    stroke: '#f43f5e',
    fill: 'rgba(244,63,94,0.15)',
    hover: 'hover:border-rose-500/30',
  },
  violet: {
    bg: 'bg-violet-500/8',
    text: 'text-violet-500',
    ring: 'ring-violet-500/12',
    stroke: '#8b5cf6',
    fill: 'rgba(139,92,246,0.15)',
    hover: 'hover:border-violet-500/30',
  },
};

export function KpiCard({
  label,
  value,
  icon: Icon,
  trend,
  color = 'blue',
  size = 'md',
  onClick,
  pulse = false,
}: KpiCardProps) {
  const c = colorMap[color];
  const isLarge = size === 'lg';

  return (
    <motion.div
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
      className={[
        'group relative overflow-hidden rounded-2xl border bg-card/70 backdrop-blur-sm transition-colors',
        'border-border/30 shadow-sm',
        c.hover,
        'hover:bg-card hover:shadow-md',
        onClick ? 'cursor-pointer' : '',
      ].join(' ')}
      onClick={onClick}
    >
      {/* subtle gradient overlay */}
      <div
        className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
        style={{
          background: `radial-gradient(600px circle at 80% 20%, ${c.fill}, transparent 60%)`,
        }}
      />

      <div className="relative p-5">
        <div className="flex items-start justify-between">
          <div className={isLarge ? 'space-y-2' : 'space-y-1'}>
            <p className="text-xs font-medium text-muted-foreground/70 tracking-wide">
              {label}
            </p>
            <p
              className={[
                'font-bold tabular-nums tracking-tight text-foreground',
                isLarge ? 'text-3xl' : 'text-2xl',
              ].join(' ')}
            >
              {value}
            </p>
          </div>
          <span
            className={[
              'flex shrink-0 items-center justify-center rounded-xl',
              isLarge ? 'h-11 w-11' : 'h-10 w-10',
              c.bg,
              c.text,
              'ring-1',
              c.ring,
            ].join(' ')}
          >
            <Icon className={isLarge ? 'h-5 w-5' : 'h-4 w-4'} />
            {pulse && (
              <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-40" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-current" />
              </span>
            )}
          </span>
        </div>

        {trend && trend.length > 0 && (
          <div className="mt-3 h-10">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c.stroke} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={c.stroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={c.stroke}
                  strokeWidth={2}
                  fill={`url(#grad-${color})`}
                  animationDuration={1200}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </motion.div>
  );
}
