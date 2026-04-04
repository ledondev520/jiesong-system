/**
 * 数据可视化图表组件库
 * 基于 Recharts 的图表组件封装
 */

export { default as SalesChart } from './SalesChart';
export { default as FinanceChart } from './FinanceChart';
export { default as CustomsChart } from './CustomsChart';
export { default as InventoryChart } from './InventoryChart';
export { ChartCard } from './ChartCard';
export { ChartSkeleton } from './ChartSkeleton';

// 通用类型定义
export interface ChartDataPoint {
  name: string;
  value: number;
  [key: string]: string | number | boolean | undefined;
}

export interface TimeSeriesDataPoint {
  date: string;
  value: number;
  [key: string]: string | number | boolean | undefined;
}
