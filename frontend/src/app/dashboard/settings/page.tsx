'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { X, Plus, Save } from 'lucide-react';
import { toast } from 'sonner';
import { DEFAULT_EXCHANGE_RATE, DEFAULT_PROFIT_RATE, UNITS as INITIAL_UNITS } from '@/lib/constants';

const configSchema = z.object({
  exchangeRate: z.number().min(0.1, '汇率必须大于0'),
  profitRate: z.number().min(1.0, '利润率必须大于1.0'),
  apiKey: z.string().optional(),
});

type ConfigFormValues = z.infer<typeof configSchema>;

export default function SettingsPage() {
  const [units, setUnits] = useState<string[]>(INITIAL_UNITS);
  const [newUnit, setNewUnit] = useState('');
  const [brokers, setBrokers] = useState<string[]>(['捷淞', '埋单', '其他厂家报关', '不报关']);
  const [newBroker, setNewBroker] = useState('');

  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      exchangeRate: DEFAULT_EXCHANGE_RATE,
      profitRate: DEFAULT_PROFIT_RATE,
      apiKey: '',
    },
  });

  const onSubmit = (data: ConfigFormValues) => {
    // Simulate save
    console.log(data);
    toast.success('系统配置已保存');
  };

  const handleAddUnit = () => {
    if (newUnit && !units.includes(newUnit)) {
      setUnits([...units, newUnit]);
      setNewUnit('');
      toast.success('单位添加成功');
    }
  };

  const handleDeleteUnit = (unit: string) => {
    setUnits(units.filter(u => u !== unit));
  };

  const handleAddBroker = () => {
    if (newBroker && !brokers.includes(newBroker)) {
      setBrokers([...brokers, newBroker]);
      setNewBroker('');
      toast.success('报关公司添加成功');
    }
  };

  const handleDeleteBroker = (broker: string) => {
    setBrokers(brokers.filter(b => b !== broker));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">系统设置</h2>
        <p className="text-muted-foreground">管理系统全局参数与数据字典。</p>
      </div>

      <Tabs defaultValue="basic" className="space-y-4">
        <TabsList>
          <TabsTrigger value="basic">基础设置</TabsTrigger>
          <TabsTrigger value="enums">数据字典</TabsTrigger>
        </TabsList>

        <TabsContent value="basic">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>参数配置</CardTitle>
                  <CardDescription>影响智能定价与汇率计算的全局参数。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="exchangeRate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>默认汇率 (USD/CNY)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" {...field} />
                          </FormControl>
                          <FormDescription>用于销售合同的初始汇率填充。</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="profitRate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>默认利润率</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" {...field} />
                          </FormControl>
                          <FormDescription>例如 1.3 表示 30% 利润。</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>AI 集成</CardTitle>
                  <CardDescription>配置 Kimi API 密钥以启用智能助手功能。</CardDescription>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="apiKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Kimi API Key</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="sk-..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button type="submit" size="lg">
                  <Save className="mr-2 h-4 w-4" /> 保存配置
                </Button>
              </div>
            </form>
          </Form>
        </TabsContent>

        <TabsContent value="enums" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>商品单位</CardTitle>
              <CardDescription>系统中可用的计量单位。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input 
                  placeholder="输入新单位 (例如: 卷)" 
                  value={newUnit} 
                  onChange={(e) => setNewUnit(e.target.value)}
                  className="max-w-xs"
                />
                <Button onClick={handleAddUnit} variant="secondary">添加</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {units.map((unit) => (
                  <Badge key={unit} variant="outline" className="pl-2 pr-1 py-1 text-sm">
                    {unit}
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-4 w-4 ml-1 hover:bg-destructive/20 hover:text-destructive rounded-full"
                      onClick={() => handleDeleteUnit(unit)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>报关公司</CardTitle>
              <CardDescription>货柜报关时的可选公司。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input 
                  placeholder="输入新报关公司" 
                  value={newBroker} 
                  onChange={(e) => setNewBroker(e.target.value)}
                  className="max-w-xs"
                />
                <Button onClick={handleAddBroker} variant="secondary">添加</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {brokers.map((broker) => (
                  <Badge key={broker} variant="outline" className="pl-2 pr-1 py-1 text-sm">
                    {broker}
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-4 w-4 ml-1 hover:bg-destructive/20 hover:text-destructive rounded-full"
                      onClick={() => handleDeleteBroker(broker)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
