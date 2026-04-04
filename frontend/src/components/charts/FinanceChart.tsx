/**
 * 财务统计图表
 */
'use client';

import {
  BarChart,
  Bar,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';
import { ChartCard } from './ChartCard';
import { ChartSkeleton } from './ChartSkeleton';

const COLORS = ['#00C49F', '#FF8042', '#0088FE', '#FFBB28', '#8884D8', '#FF6B6B'];

interface FinanceChartProps {
  data?: {
    monthlyData?: Array<{
      month: string;
      receipts: number;
      payments: number;
      net: number;
    }>;
    paymentStatus?: Array<{
      name: string;
      value: number;
    }>;
    currencyDistribution?: Array<{
      name: string;
      value: number;
    }>;
  };
  isLoading?: boolean;
  className?: string;
}

export default function FinanceChart({
  data,
  isLoading,
  className,
}: FinanceChartProps) {
  if (isLoading) {
    return <ChartSkeleton className={className} />;
  }

  const monthlyData = data?.monthlyData || [];
  const paymentStatusData = data?.paymentStatus || [];
  const currencyData = data?.currencyDistribution || [];

  return (
    <div className={`grid gap-4 md:grid-cols-2 ${className}`}>
      {/* 收付款趋势 */}
      <ChartCard
        title="收付款趋势"
        description="月度收款和付款对比"
        className="md:col-span-2"
      >
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={monthlyData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip
              formatter={(value) => [`$${Number(value).toLocaleString()}`, '']}
            />
            <Legend />
            <Bar dataKey="receipts" name="收款" fill="#00C49F" radius={[4, 4, 0, 0]} />
            <Bar dataKey="payments" name="付款" fill="#FF8042" radius={[4, 4, 0, 0]} />
            <Line
              type="monotone"
              dataKey="net"
              name="净额"
              stroke="#0088FE"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 付款状态分布 */}
      <ChartCard title="付款状态" description="付款状态分布">
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={paymentStatusData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
            >
              {paymentStatusData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => `$${Number(value).toLocaleString()}`} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 币种分布 */}
      <ChartCard title="币种分布" description="按币种统计金额">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={currencyData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip formatter={(value) => `$${Number(value).toLocaleString()}`} />
            <Bar dataKey="value" name="金额" fill="#8884D8" radius={[4, 4, 0, 0]}>
              {currencyData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
