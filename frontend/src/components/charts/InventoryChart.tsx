/**
 * 库存统计图表
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
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import { ChartCard } from './ChartCard';
import { ChartSkeleton } from './ChartSkeleton';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#FF6B6B'];

interface InventoryChartProps {
  data?: {
    monthlyInventory?: Array<{
      month: string;
      inbound: number;
      outbound: number;
      stock: number;
    }>;
    productCategory?: Array<{
      name: string;
      value: number;
    }>;
    storeDistribution?: Array<{
      name: string;
      value: number;
    }>;
    turnoverRate?: Array<{
      name: string;
      rate: number;
    }>;
  };
  isLoading?: boolean;
  className?: string;
}

export default function InventoryChart({
  data,
  isLoading,
  className,
}: InventoryChartProps) {
  if (isLoading) {
    return <ChartSkeleton className={className} />;
  }

  const monthlyData = data?.monthlyInventory || [];
  const categoryData = data?.productCategory || [];
  const storeData = data?.storeDistribution || [];
  const turnoverData = data?.turnoverRate || [];

  return (
    <div className={`grid gap-4 md:grid-cols-2 ${className}`}>
      {/* 月度出入库趋势 */}
      <ChartCard
        title="出入库趋势"
        description="月度入库和出库统计"
        className="md:col-span-2"
      >
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={monthlyData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="inbound" name="入库" fill="#00C49F" radius={[4, 4, 0, 0]} />
            <Bar dataKey="outbound" name="出库" fill="#FF8042" radius={[4, 4, 0, 0]} />
            <Line
              type="monotone"
              dataKey="stock"
              name="库存"
              stroke="#0088FE"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 产品类别分布 */}
      <ChartCard title="产品类别" description="按类别统计库存">
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={categoryData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              dataKey="value"
              label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
            >
              {categoryData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 门店库存分布 */}
      <ChartCard title="门店库存" description="各门店库存分布">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={storeData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis dataKey="name" type="category" width={80} />
            <Tooltip />
            <Bar dataKey="value" name="库存数量" fill="#8884D8" radius={[0, 4, 4, 0]}>
              {storeData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 库存周转率 */}
      {turnoverData.length > 0 && (
        <ChartCard title="库存周转率" description="各品类周转率对比" className="md:col-span-2">
          <ResponsiveContainer width="100%" height={250}>
            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={turnoverData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="name" />
              <PolarRadiusAxis angle={30} domain={[0, 'auto']} />
              <Radar
                name="周转率"
                dataKey="rate"
                stroke="#0088FE"
                fill="#0088FE"
                fillOpacity={0.6}
              />
              <Tooltip />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}
