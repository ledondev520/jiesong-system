'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">报表统计</h2>
        <p className="text-muted-foreground">业务数据汇总与分析。</p>
      </div>

      <Tabs defaultValue="purchase" className="space-y-4">
        <TabsList>
          <TabsTrigger value="purchase">采购汇总</TabsTrigger>
          <TabsTrigger value="sales">销售汇总</TabsTrigger>
          <TabsTrigger value="profit">利润分析</TabsTrigger>
        </TabsList>

        <TabsContent value="purchase">
          <Card>
            <CardHeader>
              <CardTitle>按供应商统计</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>供应商</TableHead>
                    <TableHead className="text-right">采购总额</TableHead>
                    <TableHead className="text-right">订单数</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>佛山XX陶瓷有限公司</TableCell>
                    <TableCell className="text-right">¥1,250,000</TableCell>
                    <TableCell className="text-right">12</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>广州XX卫浴厂</TableCell>
                    <TableCell className="text-right">¥850,000</TableCell>
                    <TableCell className="text-right">8</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales">
          <Card>
            <CardHeader>
              <CardTitle>按门店统计</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>门店</TableHead>
                    <TableHead className="text-right">销售总额 ($)</TableHead>
                    <TableHead className="text-right">订单数</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Ceritos Store</TableCell>
                    <TableCell className="text-right">$450,000</TableCell>
                    <TableCell className="text-right">25</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Anaheim Store</TableCell>
                    <TableCell className="text-right">$320,000</TableCell>
                    <TableCell className="text-right">18</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profit">
          <Card>
            <CardHeader>
              <CardTitle>月度利润估算</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[200px] flex items-center justify-center text-muted-foreground bg-muted/10 border rounded-md">
                图表组件占位 (需集成 Recharts)
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
