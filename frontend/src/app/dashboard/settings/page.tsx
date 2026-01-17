/**
 * Input: 后端 /system/configs API
 * Output: 系统设置页面
 * Pos: 系统模块，管理全局参数与数据字典
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

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
import { X, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { DEFAULT_EXCHANGE_RATE, DEFAULT_PROFIT_RATE, UNITS as INITIAL_UNITS } from '@/lib/constants';
import api from '@/lib/axios';

const configSchema = z.object({
  exchangeRate: z.number().min(0.1, '汇率必须大于0'),
  profitRate: z.number().min(1.0, '利润率必须大于1.0'),
  apiKey: z.string().optional(),
});

type ConfigFormValues = z.infer<typeof configSchema>;

interface SystemConfigMap {
  exchangeRate?: number;
  profitRate?: number;
  units?: string[];
  brokers?: string[];
  [key: string]: any;
}

export default function SettingsPage() {
  const [units, setUnits] = useState<string[]>(INITIAL_UNITS);
  const [newUnit, setNewUnit] = useState('');
  const [brokers, setBrokers] = useState<string[]>(['捷淞', '埋单', '其他厂家报关', '不报关']);
  const [newBroker, setNewBroker] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      exchangeRate: DEFAULT_EXCHANGE_RATE,
      profitRate: DEFAULT_PROFIT_RATE,
      apiKey: '',
    },
  });

  // 加载系统配置
  useEffect(() => {
    const fetchConfigs = async () => {
      try {
        const response = await api.get('/system/configs');
        const configs = (response as any).data as SystemConfigMap;
        
        // 配置是对象格式，直接设置
        if (configs) {
          if (typeof configs.exchangeRate === 'number') {
            form.setValue('exchangeRate', configs.exchangeRate);
          }
          if (typeof configs.profitRate === 'number') {
            form.setValue('profitRate', configs.profitRate);
          }
          if (Array.isArray(configs.units)) {
            setUnits(configs.units);
          }
          if (Array.isArray(configs.brokers)) {
            setBrokers(configs.brokers);
          }
        }
      } catch (error) {
        console.error('加载配置失败:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchConfigs();
  }, [form]);

  // 保存单个配置
  const saveConfig = async (key: string, value: string) => {
    try {
      await api.put(`/system/configs/${key}`, { value });
    } catch (error) {
      throw error;
    }
  };

  const onSubmit = async (data: ConfigFormValues) => {
    setSaving(true);
    try {
      // 保存基础配置
      await Promise.all([
        saveConfig('exchangeRate', data.exchangeRate.toString()),
        saveConfig('profitRate', data.profitRate.toString()),
        saveConfig('units', JSON.stringify(units)),
        saveConfig('brokers', JSON.stringify(brokers)),
      ]);
      
      toast.success('系统配置已保存');
    } catch (error) {
      console.error('保存配置失败:', error);
      toast.error('保存配置失败');
    } finally {
      setSaving(false);
    }
  };

  const handleAddUnit = async () => {
    if (newUnit && !units.includes(newUnit)) {
      const newUnits = [...units, newUnit];
      setUnits(newUnits);
      setNewUnit('');
      
      // 自动保存
      try {
        await saveConfig('units', JSON.stringify(newUnits));
        toast.success('单位添加成功');
      } catch {
        toast.error('保存失败');
      }
    }
  };

  const handleDeleteUnit = async (unit: string) => {
    const newUnits = units.filter(u => u !== unit);
    setUnits(newUnits);
    
    // 自动保存
    try {
      await saveConfig('units', JSON.stringify(newUnits));
    } catch {
      toast.error('保存失败');
    }
  };

  const handleAddBroker = async () => {
    if (newBroker && !brokers.includes(newBroker)) {
      const newBrokers = [...brokers, newBroker];
      setBrokers(newBrokers);
      setNewBroker('');
      
      // 自动保存
      try {
        await saveConfig('brokers', JSON.stringify(newBrokers));
        toast.success('报关公司添加成功');
      } catch {
        toast.error('保存失败');
      }
    }
  };

  const handleDeleteBroker = async (broker: string) => {
    const newBrokers = brokers.filter(b => b !== broker);
    setBrokers(newBrokers);
    
    // 自动保存
    try {
      await saveConfig('brokers', JSON.stringify(newBrokers));
    } catch {
      toast.error('保存失败');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-2">加载配置...</span>
      </div>
    );
  }

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
                            <Input 
                              type="number" 
                              step="0.01" 
                              {...field}
                              onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                            />
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
                            <Input 
                              type="number" 
                              step="0.1" 
                              {...field}
                              onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                            />
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
                  <CardDescription>Kimi API 已在后端配置，无需在此设置。</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    AI 助手功能已就绪。如需更改 API 密钥，请联系系统管理员在服务器端配置。
                  </p>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button type="submit" size="lg" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 保存中...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" /> 保存配置
                    </>
                  )}
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
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddUnit())}
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
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddBroker())}
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
