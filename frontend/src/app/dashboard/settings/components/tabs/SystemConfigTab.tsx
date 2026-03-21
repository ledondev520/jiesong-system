/**
 * Input: 后端 /system/configs API（通过 configService）
 * Output: 系统参数表单（汇率/利润率）+ AI 模型/采样参数 + 数据字典（单位/报关公司）
 * Pos: 设置页 > 系统配置 Tab，管理员调整全局运营参数
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
import { Cpu, X, Save, Loader2, Eye, EyeOff, Key, ExternalLink, ChevronDown } from 'lucide-react';
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
  // Kimi API Key 相关状态
  const [apiKeyPlaceholder, setApiKeyPlaceholder] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  // MiniMax API Key 相关状态
  const [minimaxKeyPlaceholder, setMinimaxKeyPlaceholder] = useState('');
  const [newMinimaxKey, setNewMinimaxKey] = useState('');
  const [showMinimaxKey, setShowMinimaxKey] = useState(false);
  // 模型优先级配置
  const [primaryModel, setPrimaryModel] = useState('kimi-k2-turbo-preview');
  const [fallbackModel, setFallbackModel] = useState('kimi-k2-thinking-turbo');
  const [temperature, setTemperature] = useState<number>(0.7);
  const [maxTokens, setMaxTokens] = useState<number>(4096);
  // 汇率同步
  const [syncing, setSyncing] = useState(false);

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
          // 1.1. 若后端返回 Kimi API Key 占位符（脱敏），显示提示用户当前已配置
          if (typeof configs.apiKey === 'string' && configs.apiKey) {
            setApiKeyPlaceholder(configs.apiKey);
          }
          // 1.2. 若后端返回 MiniMax API Key 占位符
          if (typeof configs.minimaxApiKey === 'string' && configs.minimaxApiKey) {
            setMinimaxKeyPlaceholder(configs.minimaxApiKey);
          }
          // 1.3. 模型优先级
          if (typeof configs.aiPrimaryModel === 'string' && configs.aiPrimaryModel) {
            setPrimaryModel(configs.aiPrimaryModel);
          }
          if (typeof configs.aiFallbackModel === 'string' && configs.aiFallbackModel) {
            setFallbackModel(configs.aiFallbackModel);
          }
          if (typeof configs.aiTemperature === 'number') setTemperature(configs.aiTemperature);
          if (typeof configs.aiMaxTokens === 'number') setMaxTokens(configs.aiMaxTokens);
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
      if (newApiKey.trim()) {
        tasks.push(saveConfig('apiKey', newApiKey.trim()));
      }
      // 1.2. 若用户填写了新 MiniMax API Key，一并保存
      if (newMinimaxKey.trim()) {
        tasks.push(saveConfig('minimaxApiKey', newMinimaxKey.trim()));
      }
      // 1.3. 模型优先级与采样参数
      tasks.push(saveConfig('aiPrimaryModel', primaryModel));
      tasks.push(saveConfig('aiFallbackModel', fallbackModel));
      tasks.push(saveConfig('aiTemperature', temperature));
      tasks.push(saveConfig('aiMaxTokens', maxTokens));
      await Promise.all(tasks);
      if (newApiKey.trim()) {
        setApiKeyPlaceholder('sk-****');
        setNewApiKey('');
      }
      if (newMinimaxKey.trim()) {
        setMinimaxKeyPlaceholder('sk-****');
        setNewMinimaxKey('');
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

          {/* 模型优先级与采样参数（置于 API Key 卡片之前） */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-muted-foreground" />
                AI 模型优先级
              </CardTitle>
              <CardDescription>
                配置 AI 助手的首选模型与备用模型。首选模型响应失败时自动切换至备用模型。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">首选模型（Primary）</label>
                  <Select value={primaryModel} onValueChange={setPrimaryModel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kimi-k2-turbo-preview">kimi-k2-turbo-preview（默认）</SelectItem>
                      <SelectItem value="kimi-k2-thinking-turbo">kimi-k2-thinking-turbo（推理）</SelectItem>
                      <SelectItem value="moonshot-v1-8k">moonshot-v1-8k（快速）</SelectItem>
                      <SelectItem value="minimax-m2.7">minimax-m2.7（MiniMax）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">备用模型（Fallback）</label>
                  <Select value={fallbackModel} onValueChange={setFallbackModel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kimi-k2-thinking-turbo">kimi-k2-thinking-turbo（推理）</SelectItem>
                      <SelectItem value="kimi-k2-turbo-preview">kimi-k2-turbo-preview（默认）</SelectItem>
                      <SelectItem value="moonshot-v1-8k">moonshot-v1-8k（快速）</SelectItem>
                      <SelectItem value="minimax-m2.7">minimax-m2.7（MiniMax）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3 max-w-xl">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-sm font-medium" htmlFor="ai-temperature">
                    采样温度（Temperature）
                  </label>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {temperature.toFixed(1)} — {getTemperatureStyleLabel(temperature)}
                  </span>
                </div>
                <Slider
                  id="ai-temperature"
                  min={0}
                  max={1}
                  step={0.1}
                  value={[temperature]}
                  onValueChange={([v]) => setTemperature(v)}
                  className="max-w-md"
                />
                <p className="text-xs text-muted-foreground">
                  0–0.3 偏保守，0.4–0.7 均衡，0.8–1 更富创意；影响非推理对话的随机性。
                </p>
              </div>

              <div className="space-y-2 max-w-md">
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
                  最大输出长度（token 数），影响 AI 回复的最大长度。
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground border-t pt-4">
                <span>当前首选：</span>
                <Badge variant="outline" className="font-mono text-[10px]">{primaryModel}</Badge>
                <span className="ml-2">备用：</span>
                <Badge variant="outline" className="font-mono text-[10px]">{fallbackModel}</Badge>
              </div>
            </CardContent>
          </Card>

          {/* AI 集成（Kimi）— 可折叠以减轻视觉重量 */}
          <Card className="overflow-hidden p-0">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2 min-w-0">
                  <Key className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">AI 集成（Kimi API）</span>
                  {apiKeyPlaceholder ? (
                    <Badge variant="secondary" className="text-[10px] font-normal shrink-0">已配置</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] font-normal shrink-0">未配置</Badge>
                  )}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <CardContent className="border-t px-4 pb-4 pt-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground max-w-prose">
                    {apiKeyPlaceholder
                      ? `当前已配置 API Key（${apiKeyPlaceholder}）。若需更新，在下方输入新密钥后点击保存。`
                      : '尚未配置 Kimi API Key，请前往 Kimi 控制台获取密钥后填写。'}
                  </p>
                  <a
                    href="https://platform.moonshot.cn/console/account"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Kimi 控制台
                  </a>
                </div>
                <div className="flex gap-2 max-w-md">
                  <div className="relative flex-1">
                    <Input
                      type={showApiKey ? 'text' : 'password'}
                      placeholder={apiKeyPlaceholder ? '输入新 API Key 以覆盖当前配置' : '输入 Kimi API Key (sk-...)'}
                      value={newApiKey}
                      onChange={(e) => setNewApiKey(e.target.value)}
                      className="pr-10"
                      autoComplete="off"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground"
                      onClick={() => setShowApiKey((v) => !v)}
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </details>
          </Card>

          {/* MiniMax AI 集成 */}
          <Card className="overflow-hidden p-0">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2 min-w-0">
                  <Key className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">AI 集成（MiniMax）</span>
                  {minimaxKeyPlaceholder ? (
                    <Badge variant="secondary" className="text-[10px] font-normal shrink-0">已配置</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] font-normal shrink-0">未配置</Badge>
                  )}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <CardContent className="border-t px-4 pb-4 pt-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground max-w-prose">
                    {minimaxKeyPlaceholder
                      ? `当前已配置 MiniMax API Key（${minimaxKeyPlaceholder}）。若需更新，在下方输入新密钥后点击保存。`
                      : '配置 MiniMax API Key，AI 助手将使用 minimax-m2.7 模型。'}
                  </p>
                  <a
                    href="https://platform.minimax.io/user-center/basic-information"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
                  >
                    <ExternalLink className="h-3 w-3" />
                    MiniMax 控制台
                  </a>
                </div>
                <div className="flex gap-2 max-w-md">
                  <div className="relative flex-1">
                    <Input
                      type={showMinimaxKey ? 'text' : 'password'}
                      placeholder={minimaxKeyPlaceholder ? '输入新 API Key 以覆盖当前配置' : '输入 MiniMax API Key (sk-api-...)'}
                      value={newMinimaxKey}
                      onChange={(e) => setNewMinimaxKey(e.target.value)}
                      className="pr-10"
                      autoComplete="off"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground"
                      onClick={() => setShowMinimaxKey((v) => !v)}
                    >
                      {showMinimaxKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </details>
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
