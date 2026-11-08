/**
 * Input: 可选默认排序
 * Output: 与 SortableTableHead 兼容的排序状态（asc → desc → 取消），数据不在本地排序
 * Pos: A85 服务端排序；调用方把 sortKey/sortDir 作为查询参数发给列表接口，并在其变化时回到第 1 页
 */
import { useTableSort, type SortDirection } from "./useTableSort";

const noData: never[] = [];
const noValue = () => null;

export function useServerSort<K extends string = string>(defaultSort?: {
  key: K;
  dir: SortDirection;
}) {
  const { sortKey, sortDir, onSort, resetSort } = useTableSort<never, K>(
    noData,
    noValue,
    defaultSort,
  );
  return { sortKey, sortDir, onSort, resetSort };
}
