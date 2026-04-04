/**
 * 报关统计图表
 */
'use client';

import {
  BarChart,
  Bar,
  LineChart,
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
} from 'recharts';
import { ChartCard } from './ChartCard';
import { ChartSkeleton } from './ChartSkeleton';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#FF6B6B'];

interface CustomsChartProps {
  data?: {
    monthlyDeclarations?: Array<{
      month: string;
      declarations: number;
      value: number;
    }>;
    statusDistribution?: Array<{
      name: string;
      value: number;
    }>;
    portStats?: Array<{
      name: string;
      declarations: number;
      value: number;
    }>;
  };
  isLoading?: boolean;
  className?: string;
}

export default function CustomsChart({
  data,
  isLoading,
  className,
}: CustomsChartProps) {
  if (isLoading) {
    return <ChartSkeleton className={className} />;
  }

  const monthlyData = data?.monthlyDeclarations || [];
  const statusData = data?.statusDistribution || [];
  const portData = data?.portStats || [];

  return (
    <div className={`grid gap-4 md:grid-cols-2 ${className}`}>
      {/* 月度报关趋势 */}
      <ChartCard
        title="月度报关趋势"
        description="报关单数量和金额趋势"
        className="md:col-span-2"
      >
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={monthlyData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip />
            <Legend />
            <Bar
              yAxisId="left"
              dataKey="declarations"
              name="报关单数"
              fill="#0088FE"
              radius={[4, 4, 0, 0]}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="value"
              name="货值 (USD)"
              stroke="#00C49F"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 报关状态分布 */}
      <ChartCard title="报关状态" description="报关单状态分布">
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={statusData}
              cx="50%"
              cy="50%"
              outerRadius={80}
              dataKey="value"
              label={({ name, value }) => `${name}: ${value}`}
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

      {/* 港口报关统计 */}
      <ChartCard title="港口报关" description="各港口报关单统计">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={portData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis dataKey="name" type="category" width={80} />
            <Tooltip />
            <Bar dataKey="declarations" name="报关单数" fill="#8884D8" radius={[0, 4, 4, 0]}>
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
