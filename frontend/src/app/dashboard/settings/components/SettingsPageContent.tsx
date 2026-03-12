/**
 * Input: 后端 /system/configs API、基础数据API
 * Output: 综合设置页面（基础档案+系统配置+数据导入）
 * Pos: 系统模块，整合所有设置功能
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
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
import {
  X,
  Save,
  Loader2,
  Package,
  Users,
  Store,
  Settings2,
  FileSpreadsheet,
  UserCog,
  Wrench,
  Download,
  SearchCheck,
  Bell,
  History,
  Database,
} from 'lucide-react';
import { ClaudeCostCalculator } from '@/components/tools/ClaudeCostCalculator';
import { toast } from 'sonner';
import { DEFAULT_EXCHANGE_RATE, DEFAULT_PROFIT_RATE, UNITS as INITIAL_UNITS } from '@/lib/constants';
import { PageHeader } from '@/components/layout/PageHeader';
import { configService } from '@/services/config.service';
import { exportSystemData, SystemExportType } from '@/services/system.service';

const configSchema = z.object({
  exchangeRate: z.number().min(0.1, '汇率必须大于0'),
  profitRate: z.number().min(1.0, '利润率必须大于1.0'),
  apiKey: z.string().optional(),
});

type ConfigFormValues = z.infer<typeof configSchema>;

type ConfigUpdateValue = string | number | string[];

const exportTargets: Array<{ type: SystemExportType; label: string; desc: string }> = [
  { type: 'suppliers', label: '供应商', desc: '导出供应商主数据与别名信息' },
  { type: 'stores', label: '门店', desc: '导出门店与港口基础数据' },
  { type: 'products', label: '商品', desc: '导出商品主数据与分类信息' },
  { type: 'purchases', label: '采购合同', desc: '导出采购合同与付款状态' },
  { type: 'sales', label: '出口合同', desc: '导出出口合同与收款状态' },
  { type: 'containers', label: '货柜', desc: '导出货柜与装箱摘要数据' },
  { type: 'inventory', label: '库存', desc: '导出库存状态与关联合同' },
  { type: 'payments', label: '收付款', desc: '导出财务收付款记录' },
];

/**
 * 职责：渲染综合设置页面
 * 思路：
 *   1. Tab1 基础档案：商品/供应商/门店的快捷入口
 *   2. Tab2 系统配置：汇率/利润率/数据字典
 *   3. Tab3 数据导入：CSV导入入口
 *   4. Tab4 用户管理：用户管理入口
 */
export default function SettingsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const defaultTab = searchParams.get('tab') || 'master';
  
  const [units, setUnits] = useState<string[]>(INITIAL_UNITS);
  const [newUnit, setNewUnit] = useState('');
  const [brokers, setBrokers] = useState<string[]>(['捷淞', '埋单', '其他厂家报关', '不报关']);
  const [newBroker, setNewBroker] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedExportType, setSelectedExportType] = useState<SystemExportType>('suppliers');
  const [exporting, setExporting] = useState(false);

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
        const response = await configService.getSystemConfig();
        const configs = response.data;
        
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
  const saveConfig = async (key: string, value: ConfigUpdateValue) => {
    await configService.updateSystemConfig({
      [key]: value,
    } as Record<string, ConfigUpdateValue>);
  };

  const onSubmit = async (data: ConfigFormValues) => {
    setSaving(true);
    try {
      // 保存基础配置
      await Promise.all([
        saveConfig('exchangeRate', data.exchangeRate),
        saveConfig('profitRate', data.profitRate),
        saveConfig('units', units),
        saveConfig('brokers', brokers),
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
        await saveConfig('units', newUnits);
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
      await saveConfig('units', newUnits);
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
        await saveConfig('brokers', newBrokers);
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
      await saveConfig('brokers', newBrokers);
    } catch {
      toast.error('保存失败');
    }
  };

  const handleExport = async () => {
    const target = exportTargets.find((item) => item.type === selectedExportType);
    const label = target?.label || selectedExportType;

    setExporting(true);
    try {
      await exportSystemData(selectedExportType, `${label}.csv`);
      toast.success(`${label}数据导出成功`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '导出失败';
      toast.error(message);
    } finally {
      setExporting(false);
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

  // 快捷入口配置
  const masterDataLinks = [
    { href: '/dashboard/products', label: '商品管理', icon: Package, desc: '管理商品档案' },
    { href: '/dashboard/suppliers', label: '供应商管理', icon: Users, desc: '管理供应商信息' },
    { href: '/dashboard/stores', label: '门店管理', icon: Store, desc: '管理客户门店' },
    { href: '/dashboard/hs-codes', label: 'HSCode 查询', icon: SearchCheck, desc: '查询海关编码与退税率' },
  ];

  const opsLinks = [
    { href: '/dashboard/system/notifications', label: '通知中心', icon: Bell, desc: '查看系统通知和未读提醒' },
    { href: '/dashboard/system/logs', label: '系统日志', icon: History, desc: '审计关键操作日志与变更记录' },
    { href: '/dashboard/system/import-records', label: '导入记录', icon: Database, desc: '复盘导入任务与失败明细' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="设置"
        description="管理基础档案、系统配置、数据导入与数据导出"
      />

      <Tabs defaultValue={defaultTab} className="flex gap-6" orientation="vertical">
        <TabsList className="flex flex-col h-fit w-48 shrink-0">
          <TabsTrigger value="master" className="w-full justify-start gap-2">
            <Package className="h-4 w-4" />
            基础档案
          </TabsTrigger>
          <TabsTrigger value="config" className="w-full justify-start gap-2">
            <Settings2 className="h-4 w-4" />
            系统配置
          </TabsTrigger>
          <TabsTrigger value="import" className="w-full justify-start gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            数据导入
          </TabsTrigger>
          <TabsTrigger value="ops" className="w-full justify-start gap-2">
            <History className="h-4 w-4" />
            运维中心
          </TabsTrigger>
          <TabsTrigger value="export" className="w-full justify-start gap-2">
            <Download className="h-4 w-4" />
            数据导出
          </TabsTrigger>
          <TabsTrigger value="users" className="w-full justify-start gap-2">
            <UserCog className="h-4 w-4" />
            用户管理
          </TabsTrigger>
          <TabsTrigger value="tools" className="w-full justify-start gap-2">
            <Wrench className="h-4 w-4" />
            小工具
          </TabsTrigger>
        </TabsList>

        {/* 基础档案Tab */}
        <TabsContent value="master" className="flex-1 space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {masterDataLinks.map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.href} className="hover:border-primary/50 transition-colors cursor-pointer" onClick={() => router.push(item.href)}>
                  <CardHeader className="flex flex-row items-center gap-4 pb-2">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{item.label}</CardTitle>
                      <CardDescription>{item.desc}</CardDescription>
                    </div>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* 系统配置Tab */}
        <TabsContent value="config" className="flex-1">
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

          {/* 数据字典部分 */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>数据字典</CardTitle>
              <CardDescription>系统中可用的枚举值配置</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 商品单位 */}
              <div className="space-y-2">
                <label className="text-sm font-medium">商品单位</label>
                <div className="flex gap-2">
                  <Input 
                    placeholder="输入新单位 (例如: 卷)" 
                    value={newUnit} 
                    onChange={(e) => setNewUnit(e.target.value)}
                    className="max-w-xs"
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddUnit())}
                  />
                  <Button onClick={handleAddUnit} variant="secondary" size="sm">添加</Button>
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
              </div>

              {/* 报关公司 */}
              <div className="space-y-2">
                <label className="text-sm font-medium">报关公司</label>
                <div className="flex gap-2">
                  <Input 
                    placeholder="输入新报关公司" 
                    value={newBroker} 
                    onChange={(e) => setNewBroker(e.target.value)}
                    className="max-w-xs"
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddBroker())}
                  />
                  <Button onClick={handleAddBroker} variant="secondary" size="sm">添加</Button>
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
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 数据导入Tab */}
        <TabsContent value="import" className="flex-1 space-y-4">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer" onClick={() => router.push('/dashboard/import')}>
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

        </TabsContent>

        {/* 运维中心Tab */}
        <TabsContent value="ops" className="flex-1 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {opsLinks.map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.href} className="hover:border-primary/50 transition-colors cursor-pointer" onClick={() => router.push(item.href)}>
                  <CardHeader className="flex flex-row items-center gap-4 pb-2">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{item.label}</CardTitle>
                      <CardDescription>{item.desc}</CardDescription>
                    </div>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* 数据导出Tab */}
        <TabsContent value="export" className="flex-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>数据导出</CardTitle>
              <CardDescription>选择导出类型后生成并下载对应 CSV 文件。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="export-type" className="text-sm font-medium">
                  导出类型
                </label>
                <select
                  id="export-type"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={selectedExportType}
                  onChange={(event) => setSelectedExportType(event.target.value as SystemExportType)}
                >
                  {exportTargets.map((target) => (
                    <option key={target.type} value={target.type}>
                      {target.label}
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-sm text-muted-foreground">
                {exportTargets.find((target) => target.type === selectedExportType)?.desc}
              </p>

              <Button className="w-full" onClick={handleExport} disabled={exporting}>
                <Download className="mr-2 h-4 w-4" />
                {exporting ? '导出中...' : '导出数据'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 用户管理Tab */}
        <TabsContent value="users" className="flex-1 space-y-4">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer" onClick={() => router.push('/dashboard/users')}>
            <CardHeader className="flex flex-row items-center gap-4">
              <div className="p-2 bg-primary/10 rounded-lg">
                <UserCog className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">用户管理</CardTitle>
                <CardDescription>管理系统用户与权限</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                创建和管理系统用户，分配角色权限（管理员、采购、销售）。
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 小工具Tab */}
        <TabsContent value="tools" className="flex-1 space-y-4">
          <ClaudeCostCalculator />
        </TabsContent>
      </Tabs>
    </div>
  );
}
