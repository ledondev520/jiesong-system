/**
 * Input: 商品名称（productName）
 * Output: 合规性提示气泡（基于关键词规则匹配）
 * Pos: 采购单品表单内，商品选中后自动弹出对应合规笔记
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 *
 * 规则说明：
 *   COMPLIANCE_RULES 中维护关键词 → 合规提示的映射，无需后端接口。
 *   如需动态管理规则，未来可迁移至 SystemConfig 表配置。
 */

'use client';

import { ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ComplianceRule {
  /** 关键词列表（任意一项命中即触发，不区分大小写） */
  keywords: string[];
  /** 提示标题 */
  title: string;
  /** 提示正文（Markdown 不渲染，纯文本） */
  description: string;
  /** 风险等级：high = 红，medium = 黄 */
  level: 'high' | 'medium';
}

const COMPLIANCE_RULES: ComplianceRule[] = [
  {
    keywords: ['鸟刺', '鸟签', '鸟串', '竹签', '竹棒', '竹刺', '肉签', '签子', '烤签', '肉签'],
    title: '鸟类/竹签类商品 — 美国各州限制',
    description:
      '⚠️ 洛杉矶（CA）：单根长度 ≤ 15cm，末端须圆钝；违规有拒收风险。\n'
      + '⚠️ 纽约（NY）：禁止尖端直径 < 2mm，须附防刺包装。\n'
      + '建议发货前核实目的门店所在州的最新餐饮器具法规，并取得买方书面确认。',
    level: 'high',
  },
  {
    keywords: ['烟花', '爆竹', '鞭炮', '礼花'],
    title: '烟花爆竹 — 美国海关管控',
    description:
      '美国 CPSC 对家用烟花爆竹有严格标准（16 CFR Part 1507）。\n'
      + '出口前需取得 ATF 许可证，并核实目标州是否禁售。\n'
      + '建议联系专业报关行确认合规文件。',
    level: 'high',
  },
  {
    keywords: ['刀', '剪刀', '开刃', '菜刀', '削皮刀'],
    title: '刀具类 — 美国 TSA / 各州法规',
    description:
      '刀片长度 > 7cm 或双刃刀可能在部分州受限（如加州）。\n'
      + '建议标注用途（厨房用途），并检查目的地门店所在州的刀具零售法规。',
    level: 'medium',
  },
  {
    keywords: ['食品', '零食', '糕点', '月饼', '糖果', '饼干', '方便面'],
    title: '食品类 — FDA 事先通知义务',
    description:
      '出口到美国的食品须在发货前至少 2-8 小时向 FDA 提交 Prior Notice。\n'
      + '确认商品是否含有 FDA 监管成分，并在 B/L 备注 FDA Registration Number。',
    level: 'medium',
  },
];

interface ComplianceHintProps {
  /** 选中商品的名称（customsName / name） */
  productName: string;
}

/**
 * 职责：根据商品名称匹配合规规则并展示提示
 * 思路：遍历 COMPLIANCE_RULES，将 productName 与 keywords 做不区分大小写的包含匹配
 */
export function ComplianceHint({ productName }: ComplianceHintProps) {
  if (!productName) return null;

  const lower = productName.toLowerCase();
  const matches = COMPLIANCE_RULES.filter((rule) =>
    rule.keywords.some((kw) => lower.includes(kw.toLowerCase()))
  );

  if (matches.length === 0) return null;

  return (
    <div className="space-y-2 mt-2">
      {matches.map((rule, i) => (
        <Alert
          key={i}
          className={
            rule.level === 'high'
              ? 'border-destructive/50 bg-destructive/5'
              : 'border-amber-500/50 bg-amber-50/30 dark:bg-amber-950/10'
          }
        >
          <ShieldAlert
            className={`h-4 w-4 ${rule.level === 'high' ? 'text-destructive' : 'text-amber-600'}`}
          />
          <AlertTitle className="text-sm">{rule.title}</AlertTitle>
          <AlertDescription className="text-xs whitespace-pre-line leading-relaxed">
            {rule.description}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
