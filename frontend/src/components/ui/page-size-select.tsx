/**
 * Input: value（当前每页条数）、onChange（变更回调）、options（可选条数列表）
 * Output: 每页条数选择器组件
 * Pos: 通用UI组件，用于所有有分页的列表页面
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface PageSizeSelectProps {
  /** 当前每页条数 */
  value: number;
  /** 条数变更回调 */
  onChange: (size: number) => void;
  /** 可选条数列表，默认 [20, 50, 100] */
  options?: number[];
}

/**
 * 职责：渲染每页条数选择器
 * 思路：使用 shadcn/ui Select 组件，将条数选项格式化为"每页 X 条"显示
 * @param value 当前每页条数
 * @param onChange 条数变更回调
 * @param options 可选条数列表
 */
export function PageSizeSelect({
  value,
  onChange,
  options = [20, 50, 100],
}: PageSizeSelectProps) {
  return (
    <Select
      value={String(value)}
      onValueChange={(v) => onChange(Number(v))}
    >
      <SelectTrigger className="h-8 w-[130px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((size) => (
          <SelectItem key={size} value={String(size)} className="text-xs">
            每页 {size} 条
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
