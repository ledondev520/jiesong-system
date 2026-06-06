/**
 * Input: actions array
 * Output: Large icon-based quick action buttons
 * Pos: Dashboard below KPI cards
 */

'use client';

import { motion } from 'framer-motion';
import { type LucideIcon } from 'lucide-react';

interface QuickAction {
  label: string;
  description?: string;
  icon: LucideIcon;
  color: 'blue' | 'green' | 'amber' | 'rose' | 'violet' | 'slate';
  onClick: () => void;
}

const colorMap = {
  blue: 'bg-blue-500/10 text-blue-500 group-hover:bg-blue-500/15',
  green: 'bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500/15',
  amber: 'bg-amber-500/10 text-amber-500 group-hover:bg-amber-500/15',
  rose: 'bg-rose-500/10 text-rose-500 group-hover:bg-rose-500/15',
  violet: 'bg-violet-500/10 text-violet-500 group-hover:bg-violet-500/15',
  slate: 'bg-muted text-muted-foreground group-hover:bg-muted/80',
};

interface QuickActionGridProps {
  actions: QuickAction[];
}

export function QuickActionGrid({ actions }: QuickActionGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {actions.map((action, i) => {
        const Icon = action.icon;
        return (
          <motion.button
            key={action.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
            whileHover={{ y: -2, transition: { duration: 0.15 } }}
            whileTap={{ scale: 0.97 }}
            onClick={action.onClick}
            className="group flex flex-col items-start gap-3 rounded-2xl border border-border/30 bg-card/60 p-4 text-left transition-colors hover:border-border/50 hover:bg-card hover:shadow-sm"
          >
            <span
              className={[
                'flex h-10 w-10 items-center justify-center rounded-xl transition-colors',
                colorMap[action.color],
              ].join(' ')}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">{action.label}</p>
              {action.description && (
                <p className="mt-0.5 text-xs text-muted-foreground/70">{action.description}</p>
              )}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
