/**
 * Input: 路由跳转能力（useRouter）
 * Output: CSV 数据导入入口卡片
 * Pos: 设置页 > 数据导入 Tab，引导用户跳转导入页
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { FileSpreadsheet } from 'lucide-react';

/**
 * 职责：渲染 CSV 数据导入引导入口
 */
export function DataImportTab() {
  const router = useRouter();

  return (
    <Card
      className="hover:border-primary/50 transition-colors cursor-pointer"
      onClick={() => router.push('/dashboard/import')}
    >
      <CardHeader className="flex flex-row items-center gap-4">
        <div className="p-2 bg-primary/10 rounded-lg">
          <FileSpreadsheet className="h-6 w-6 text-primary" />
        </div>
        <div>
          <CardTitle className="text-lg">CSV数据导入</CardTitle>
          <CardDescription>导入历史采购、销售数据</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          支持导入CSV格式的历史数据，系统会自动解析并创建相应的合同、商品、供应商等记录。
        </p>
      </CardContent>
    </Card>
  );
}
