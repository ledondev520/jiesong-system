/**
 * Input: DateStringPicker 的 props（value/onChange/id/triggerProps.id）
 * Output: 测试替身：渲染原生 <input type="date">，让表单类测试能直接 change/type 日期值
 * Pos: 页面测试用 vi.mock("@/components/ui/date-picker", () => import("@/test/date-string-picker-mock")) 替换真组件；
 *      真组件的行为（占位、本地时区、选择回传）由 components/ui/date-string-picker.test.tsx 单独覆盖
 */
interface Props {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  triggerProps?: { id?: string };
}

export function DateStringPicker({ value, onChange, id, triggerProps }: Props) {
  return (
    <input
      type="date"
      id={id ?? triggerProps?.id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
