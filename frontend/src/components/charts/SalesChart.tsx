/**
 * 销售合同统计图表
 */
'use client';

import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { ChartCard } from './ChartCard';
import { ChartSkeleton } from './ChartSkeleton';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#FF6B6B'];

interface SalesChartProps {
  data?: {
    monthlyData?: Array<{
      month: string;
      contracts: number;
      amount: number;
    }>;
    statusDistribution?: Array<{
      name: string;
      value: number;
    }>;
    portDistribution?: Array<{
      name: string;
      value: number;
    }>;
  };
  isLoading?: boolean;
  className?: string;
}

export default function SalesChart({
  data,
  isLoading,
  className,
}: SalesChartProps) {
  if (isLoading) {
    return <ChartSkeleton className={className} />;
  }

  const monthlyData = data?.monthlyData || [];
  const statusData = data?.statusDistribution || [];
  const portData = data?.portDistribution || [];

  return (
    <div className={`grid gap-4 md:grid-cols-2 ${className}`}>
      {/* 月度合同趋势 */}
      <ChartCard
        title="月度合同趋势"
        description="合同数量和金额月度统计"
        className="md:col-span-2"
      >
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={monthlyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorContracts" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0088FE" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#0088FE" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00C49F" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#00C49F" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="month" />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="right" />
            <CartesianGrid strokeDasharray="3 3" />
            <Tooltip />
            <Legend />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="contracts"
              name="合同数量"
              stroke="#0088FE"
              fillOpacity={1}
              fill="url(#colorContracts)"
            />
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="amount"
              name="金额 (USD)"
              stroke="#00C49F"
              fillOpacity={1}
              fill="url(#colorAmount)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 合同状态分布 */}
      <ChartCard title="合同状态分布" description="按状态统计合同数量">
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={statusData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {statusData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 港口分布 */}
      <ChartCard title="港口分布" description="按港口统计合同数量">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={portData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis dataKey="name" type="category" width={80} />
            <Tooltip />
            <Bar dataKey="value" name="合同数量" fill="#8884D8" radius={[0, 4, 4, 0]}>
              {portData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
