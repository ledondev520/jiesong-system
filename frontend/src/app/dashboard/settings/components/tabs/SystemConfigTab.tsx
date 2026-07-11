/**
 * Input: 后端 /system/configs API（通过 configService）、/hs-codes/hsciq-usage API
 * Output: 系统参数表单（汇率/利润率）+ 业务流程参数（盖章平台链接/开票抬头）+ AI 模型/采样参数（仅 Kimi/Moonshot）+ HSCIQ API 开关 + 数据字典（单位/报关公司）
 * Pos: 设置页 > 系统配置 Tab，管理员调整全局运营参数与外部 API 集成
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
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
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Cpu, X, Save, Loader2, Key, ExternalLink, Globe } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { DEFAULT_EXCHANGE_RATE, DEFAULT_PROFIT_RATE, UNITS as INITIAL_UNITS } from '@/lib/constants';
import { configService } from '@/services/config.service';
import api from '@/lib/axios';
import type { ApiResponse } from '@/types';

const configSchema = z.object({
  exchangeRate: z.number().min(0.1, '汇率必须大于0'),
  profitRate: z.number().min(1.0, '利润率必须大于1.0'),
});

type ConfigFormValues = z.infer<typeof configSchema>;
type ConfigUpdateValue = string | number | string[];

/**
 * 职责：将采样温度映射为区间文案（0–0.3 保守，0.4–0.7 均衡，0.8–1 创意）
 * @param t 0–1
 */
function getTemperatureStyleLabel(t: number): string {
  if (t < 0.4) return '保守';
  if (t < 0.8) return '均衡';
  return '创意';
}

/**
 * 职责：渲染系统配置表单及数据字典管理区域
 * 思路：
 *   1. 挂载时从后端加载当前配置填充表单
 *   2. 点击保存时并行写入所有字段（含 AI API Key）
 *   3. 数据字典（单位/报关公司）增删实时生效（即时 API 写入），无需手动保存
 * @param showDictOnly 若为 true，只渲染数据字典区块（用于独立 Tab）
 */
export function SystemConfigTab({ showDictOnly = false }: { showDictOnly?: boolean }) {
  const [units, setUnits] = useState<string[]>(INITIAL_UNITS);
  const [newUnit, setNewUnit] = useState('');
  const [brokers, setBrokers] = useState<string[]>(['捷淞', '埋单', '其他厂家报关', '不报关']);
  const [newBroker, setNewBroker] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Kimi API Key 只写式配置：后端仅返回脱敏状态，页面永不渲染完整密钥
  const [kimiApiKeyConfigured, setKimiApiKeyConfigured] = useState(false);
  const [kimiApiKeyNew, setKimiApiKeyNew] = useState('');
  // 场景化模型配置
  const [chatModel, setChatModel] = useState('kimi-k2-turbo-preview');
  const [hsCodeModel, setHsCodeModel] = useState('kimi-k2-turbo-preview');
  const [temperature, setTemperature] = useState<number>(0.7);
  const [maxTokens, setMaxTokens] = useState<number>(4096);
  // HSCIQ 海关归类 API
  const [hsciqEnabled, setHsciqEnabled] = useState(false);
  const [hsciqUsage, setHsciqUsage] = useState<{ used: number; limit: number; remaining: number; available: boolean } | null>(null);
  const [hsciqToggling, setHsciqToggling] = useState(false);
  // 汇率同步
  const [syncing, setSyncing] = useState(false);
  // 业务流程参数：线上盖章平台链接 + 我方开票抬头
  const [stampPlatformUrl, setStampPlatformUrl] = useState('');
  const [invoiceTitleInfo, setInvoiceTitleInfo] = useState('');

  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      exchangeRate: DEFAULT_EXCHANGE_RATE,
      profitRate: DEFAULT_PROFIT_RATE,
    },
  });

  // 0. 加载系统配置
  useEffect(() => {
    const fetchConfigs = async () => {
      try {
        const response = await configService.getSystemConfig();
        const configs = response.data;
        if (configs) {
          if (typeof configs.exchangeRate === 'number') form.setValue('exchangeRate', configs.exchangeRate);
          if (typeof configs.profitRate === 'number') form.setValue('profitRate', configs.profitRate);
          if (Array.isArray(configs.units)) setUnits(configs.units);
          if (Array.isArray(configs.brokers)) setBrokers(configs.brokers);
          // 1.1. Kimi API Key（后端只返回脱敏状态，不回传完整密钥）
          if (typeof configs.apiKey === 'string' && configs.apiKey) {
            setKimiApiKeyConfigured(true);
          }
          // 1.2. 场景化模型配置（优先新 key，兼容旧 key）
          if (typeof configs.aiChatModel === 'string' && configs.aiChatModel) {
            setChatModel(configs.aiChatModel);
          } else if (typeof configs.aiPrimaryModel === 'string' && configs.aiPrimaryModel) {
            setChatModel(configs.aiPrimaryModel);
          }
          if (typeof configs.aiHsCodeModel === 'string' && configs.aiHsCodeModel) {
            setHsCodeModel(configs.aiHsCodeModel);
          } else if (typeof configs.aiPrimaryModel === 'string' && configs.aiPrimaryModel) {
            setHsCodeModel(configs.aiPrimaryModel);
          }
          if (typeof configs.aiTemperature === 'number') setTemperature(configs.aiTemperature);
          if (typeof configs.aiMaxTokens === 'number') setMaxTokens(configs.aiMaxTokens);
          // 1.4. HSCIQ 开关
          if (configs.hsciqEnabled === true || configs.hsciqEnabled === 'true') {
            setHsciqEnabled(true);
          }
          // 1.5. 业务流程参数
          if (typeof configs.stampPlatformUrl === 'string') setStampPlatformUrl(configs.stampPlatformUrl);
          if (typeof configs.invoiceTitleInfo === 'string') setInvoiceTitleInfo(configs.invoiceTitleInfo);
        }
      } catch (error) {
        console.error('加载配置失败:', error);
        toast.error('加载系统配置失败');
      } finally {
        setLoading(false);
      }
    };
    fetchConfigs();
  }, [form]);

  // 0.1 加载 HSCIQ 使用统计
  useEffect(() => {
    const fetchHsciqUsage = async () => {
      try {
        const res = await api.get<ApiResponse<{ enabled: boolean; available: boolean; used: number; limit: number; remaining: number }>,
          ApiResponse<{ enabled: boolean; available: boolean; used: number; limit: number; remaining: number }>>('/hs-codes/hsciq-usage');
        if (res.data) {
          setHsciqUsage({ used: res.data.used, limit: res.data.limit, remaining: res.data.remaining, available: res.data.available });
        }
      } catch {
        // 非关键信息，静默忽略
      }
    };
    fetchHsciqUsage();
  }, [hsciqEnabled]);

  /** 职责：保存单个配置键值到后端 */
  const saveConfig = async (key: string, value: ConfigUpdateValue) => {
    await configService.updateSystemConfig({ [key]: value } as Record<string, ConfigUpdateValue>);
  };

  const onSubmit = async (data: ConfigFormValues) => {
    setSaving(true);
    try {
      const tasks: Promise<unknown>[] = [
        saveConfig('exchangeRate', data.exchangeRate),
        saveConfig('profitRate', data.profitRate),
        saveConfig('units', units),
        saveConfig('brokers', brokers),
      ];
      // 1.1. 若用户填写了新 Kimi API Key，一并保存
      if (kimiApiKeyNew.trim()) {
        tasks.push(saveConfig('apiKey', kimiApiKeyNew.trim()));
      }
      // 1.2. 场景化模型与采样参数
      tasks.push(saveConfig('aiChatModel', chatModel));
      tasks.push(saveConfig('aiHsCodeModel', hsCodeModel));
      tasks.push(saveConfig('aiTemperature', temperature));
      tasks.push(saveConfig('aiMaxTokens', maxTokens));
      // 1.3. 业务流程参数（盖章平台/开票抬头）
      tasks.push(saveConfig('stampPlatformUrl', stampPlatformUrl.trim()));
      tasks.push(saveConfig('invoiceTitleInfo', invoiceTitleInfo.trim()));
      await Promise.all(tasks);
      if (kimiApiKeyNew.trim()) {
        setKimiApiKeyConfigured(true);
        setKimiApiKeyNew('');
      }
      toast.success('系统配置已保存');
    } catch (error) {
      console.error('保存配置失败:', error);
      toast.error('保存配置失败');
    } finally {
      setSaving(false);
    }
  };

  const handleAddUnit = async () => {
    if (!newUnit || units.includes(newUnit)) return;
    const newUnits = [...units, newUnit];
    setUnits(newUnits);
    setNewUnit('');
    try {
      await saveConfig('units', newUnits);
      toast.success('单位添加成功');
    } catch {
      toast.error('保存失败');
    }
  };

  /**
   * 职责：切换 HSCIQ 海关归类 API 开关（即时保存，无需表单提交）
   * @param checked 开启/关闭
   */
  const handleHsciqToggle = async (checked: boolean) => {
    setHsciqToggling(true);
    try {
      await saveConfig('hsciqEnabled', checked ? 'true' : 'false');
      setHsciqEnabled(checked);
      toast.success(checked ? 'HSCIQ 海关归类 API 已开启' : 'HSCIQ 海关归类 API 已关闭');
    } catch {
      toast.error('切换 HSCIQ 开关失败');
    } finally {
      setHsciqToggling(false);
    }
  };

  /**
   * 职责：从公开汇率 API 自动同步 USD/CNY 汇率，并填入表单
   */
  const handleSyncRate = async () => {
    setSyncing(true);
    try {
      const res = await api.post<ApiResponse<{ rate: number }>, ApiResponse<{ rate: number }>>(
        '/system/exchange-rate/sync'
      );
      const rate = res.data?.rate;
      if (rate && typeof rate === 'number') {
        form.setValue('exchangeRate', rate);
        toast.success(`已获取实时汇率：1 USD = ${rate} CNY，请点击「保存配置」以生效`);
      }
    } catch {
      toast.error('汇率同步失败，请稍后重试');
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteUnit = async (unit: string) => {
    const prev = units;
    const newUnits = units.filter((u) => u !== unit);
    setUnits(newUnits);
    try {
      await saveConfig('units', newUnits);
      toast.success(`单位「${unit}」已删除`);
    } catch {
      setUnits(prev);
      toast.error(`删除单位「${unit}」失败，请重试`);
    }
  };

  const handleAddBroker = async () => {
    if (!newBroker || brokers.includes(newBroker)) return;
    const newBrokers = [...brokers, newBroker];
    setBrokers(newBrokers);
    setNewBroker('');
    try {
      await saveConfig('brokers', newBrokers);
      toast.success('报关公司添加成功');
    } catch {
      toast.error('保存失败');
    }
  };

  const handleDeleteBroker = async (broker: string) => {
    const prev = brokers;
    const newBrokers = brokers.filter((b) => b !== broker);
    setBrokers(newBrokers);
    try {
      await saveConfig('brokers', newBrokers);
      toast.success(`报关公司「${broker}」已删除`);
    } catch {
      setBrokers(prev);
      toast.error(`删除报关公司「${broker}」失败，请重试`);
    }
  };

  /** 职责：渲染数据字典区块（商品单位 + 报关公司） */
  const renderDictSection = () => (
    <div className="space-y-6">
      {/* 商品单位 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">商品单位</CardTitle>
          <CardDescription>合同、发票中使用的计量单位，添加/删除后实时生效。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
        </CardContent>
      </Card>

      {/* 报关公司 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">报关公司</CardTitle>
          <CardDescription>出口合同中可选的报关服务商，添加/删除后实时生效。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
        </CardContent>
      </Card>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">加载配置...</span>
      </div>
    );
  }

  // 0. 若仅展示数据字典（独立 Tab 模式）
  if (showDictOnly) {
    return renderDictSection();
  }

  return (
    <div className="space-y-4">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* 基础参数 */}
          <Card>
            <CardHeader>
              <CardTitle>基础参数</CardTitle>
              <CardDescription>影响智能定价与汇率计算的全局参数，修改后需点击「保存配置」生效。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="exchangeRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>默认汇率 (USD/CNY)</FormLabel>
                      <div className="flex gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            {...field}
                            onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                          />
                        </FormControl>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          disabled={syncing}
                          onClick={handleSyncRate}
                          title="从公开 API 自动获取实时汇率"
                        >
                          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : '同步'}
                        </Button>
                      </div>
                      <FormDescription>用于出口合同的初始汇率填充。</FormDescription>
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

          {/* 业务流程参数：盖章平台 + 开票抬头 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                业务流程参数
              </CardTitle>
              <CardDescription>采购付款与催票流程中使用的外部链接与固定文本。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="stamp-platform-url">线上盖章平台链接</label>
                <Input
                  id="stamp-platform-url"
                  placeholder="例如：https://xxx.esign.cn（购销合同生成后点击「在线盖章」跳转）"
                  value={stampPlatformUrl}
                  onChange={(e) => setStampPlatformUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">采购合同详情页「在线盖章」按钮的跳转地址。</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="invoice-title-info">我方开票抬头信息</label>
                <textarea
                  id="invoice-title-info"
                  className="flex min-h-[96px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  placeholder={'公司名称：XXX有限公司\n纳税人识别号：91XXXXXXXXXXXXXXXX\n地址电话：...\n开户行及账号：...'}
                  value={invoiceTitleInfo}
                  onChange={(e) => setInvoiceTitleInfo(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">催开发票时附在开票信息文本末尾，便于供应商开具增值税专用发票。</p>
              </div>
            </CardContent>
          </Card>

          {/* AI 模型优先级 + API Key 集成 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-muted-foreground" />
                AI 模型配置
              </CardTitle>
              <CardDescription>
                为不同使用场景选择合适的模型，配置采样参数与 API 密钥。每个场景内置自动降级，无需手动配置备用模型。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 上半区：左侧模型选择 + 右侧 API Key */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 左列：场景化模型选择 */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">AI 助手问答</label>
                    <Select value={chatModel} onValueChange={setChatModel}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kimi-k2-turbo-preview">kimi-k2-turbo-preview（均衡）</SelectItem>
                        <SelectItem value="moonshot-v1-8k">moonshot-v1-8k（快速）</SelectItem>
                        <SelectItem value="kimi-k2-thinking-turbo">kimi-k2-thinking-turbo（深度推理）</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">用于 AI 聊天助手的日常问答。</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">HS Code 推荐与申报要素</label>
                    <Select value={hsCodeModel} onValueChange={setHsCodeModel}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kimi-k2-turbo-preview">kimi-k2-turbo-preview（均衡）</SelectItem>
                        <SelectItem value="moonshot-v1-8k">moonshot-v1-8k（快速）</SelectItem>
                        <SelectItem value="kimi-k2-thinking-turbo">kimi-k2-thinking-turbo（深度推理）</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">用于智能 HS 编码推荐与申报要素自动填写。</p>
                  </div>
                </div>

                {/* 右列：API Key 配置 */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium flex items-center gap-1.5">
                        <Key className="h-3.5 w-3.5 text-muted-foreground" />
                        Kimi API Key
                      </label>
                      <a
                        href="https://platform.moonshot.cn/console/account"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        控制台
                      </a>
                    </div>
                    {kimiApiKeyConfigured && (
                      <Badge variant="secondary" className="w-fit text-[10px]">已配置（只写）</Badge>
                    )}
                    <Input
                      type="password"
                      placeholder={kimiApiKeyConfigured ? '输入新 Key 以覆盖' : '输入 Kimi API Key (sk-...)'}
                      value={kimiApiKeyNew}
                      onChange={(e) => setKimiApiKeyNew(e.target.value)}
                      autoComplete="new-password"
                    />
                    <p className="text-xs text-muted-foreground">密钥只允许覆盖写入，保存后不会再从系统读回或显示。</p>
                  </div>
                </div>
              </div>

              {/* 下半区：采样参数 */}
              <div className="border-t pt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-sm font-medium" htmlFor="ai-temperature">
                        采样温度（Temperature）
                      </label>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {(temperature ?? 0.7).toFixed(1)} — {getTemperatureStyleLabel(temperature ?? 0.7)}
                      </span>
                    </div>
                    <Slider
                      id="ai-temperature"
                      min={0}
                      max={1}
                      step={0.1}
                      value={[temperature ?? 0.7]}
                      onValueChange={([v]) => setTemperature(v ?? 0.7)}
                    />
                    <p className="text-xs text-muted-foreground">
                      0–0.3 偏保守，0.4–0.7 均衡，0.8–1 更富创意。
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="ai-max-tokens">
                      最大输出长度（Max tokens）
                    </label>
                    <Input
                      id="ai-max-tokens"
                      type="number"
                      min={256}
                      max={8192}
                      step={256}
                      value={maxTokens}
                      onChange={(e) => {
                        const v = e.target.valueAsNumber;
                        if (!Number.isFinite(v)) return;
                        const stepped = Math.round(v / 256) * 256;
                        setMaxTokens(Math.min(8192, Math.max(256, stepped)));
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      影响 AI 回复的最大长度。
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground border-t pt-4">
                <span>问答：</span>
                <Badge variant="outline" className="font-mono text-[10px]">{chatModel}</Badge>
                <span className="ml-2">HS推荐：</span>
                <Badge variant="outline" className="font-mono text-[10px]">{hsCodeModel}</Badge>
              </div>
            </CardContent>
          </Card>

          {/* HSCIQ 海关归类 API 开关 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">HSCIQ 海关归类 API</CardTitle>
                  {hsciqEnabled ? (
                    <Badge variant="secondary" className="text-[10px] font-normal">已开启</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] font-normal">已关闭</Badge>
                  )}
                </div>
                <Switch
                  checked={hsciqEnabled}
                  onCheckedChange={handleHsciqToggle}
                  disabled={hsciqToggling}
                />
              </div>
              <CardDescription>
                开启后，HS 编码推荐与申报要素填写将优先调用 HSCIQ 官方海关归类 API（含真实归类实例、官方税率与申报要素模板）。
                关闭后仅使用本地数据库与 AI 推断。
              </CardDescription>
            </CardHeader>
            {hsciqEnabled && hsciqUsage && (
              <CardContent className="pt-0">
                <div className="flex flex-wrap items-center gap-4 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <span>API 状态：</span>
                    {hsciqUsage.available ? (
                      <Badge variant="secondary" className="text-[10px]">已配置</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px]">未配置 API Key</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span>今日调用：</span>
                    <span className="tabular-nums font-medium text-foreground">{hsciqUsage.used}</span>
                    <span>/</span>
                    <span className="tabular-nums">{hsciqUsage.limit}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span>剩余配额：</span>
                    <span className={`tabular-nums font-medium ${hsciqUsage.remaining <= 10 ? 'text-destructive' : 'text-foreground'}`}>
                      {hsciqUsage.remaining}
                    </span>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          <div className="flex justify-end">
            <Button type="submit" size="lg" disabled={saving}>
              {saving ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />保存中...</>
              ) : (
                <><Save className="mr-2 h-4 w-4" />保存配置</>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
