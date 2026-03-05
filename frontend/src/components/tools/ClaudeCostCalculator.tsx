/**
 * Input: 用户上传的截图（包含 token 使用数据）
 * Output: Claude 4.5 Opus 模型费用计算结果
 * Pos: 小工具组件，用于计算 API 调用费用
 * 
 * 费率说明（Claude 4.5 Opus）：
 * - Input: $5 / 百万 token
 * - Output: $20 / 百万 token
 * - Cache Read: $0.5 / 百万 token
 * - Cache Write: $6.25 / 百万 token
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import NextImage from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calculator, Upload, Image as ImageIcon, Loader2, DollarSign, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { aiService } from '@/services/ai.service';

// Claude 4.5 Opus 费率（美元/百万 token）
const RATES = {
  input: 5,
  output: 20,
  cacheRead: 0.5,
  cacheWrite: 6.25,
};

interface TokenUsage {
  cacheRead: number;
  cacheWrite: number;
  input: number;
  output: number;
  total: number;
}

/**
 * 职责：渲染 Claude 费用计算器
 * 思路：
 *   1. 整个组件区域支持粘贴图片
 *   2. 调用 AI 识别图片中的 token 数量
 *   3. 按费率计算总费用
 */
export function ClaudeCostCalculator() {
  const [usage, setUsage] = useState<TokenUsage>({
    cacheRead: 0,
    cacheWrite: 0,
    input: 0,
    output: 0,
    total: 0,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 计算费用
  const calculateCost = useCallback((data: TokenUsage) => {
    const cacheReadCost = (data.cacheRead / 1_000_000) * RATES.cacheRead;
    const cacheWriteCost = (data.cacheWrite / 1_000_000) * RATES.cacheWrite;
    const inputCost = (data.input / 1_000_000) * RATES.input;
    const outputCost = (data.output / 1_000_000) * RATES.output;
    return {
      cacheRead: cacheReadCost,
      cacheWrite: cacheWriteCost,
      input: inputCost,
      output: outputCost,
      total: cacheReadCost + cacheWriteCost + inputCost + outputCost,
    };
  }, []);

  // 解析 AI 识别结果
  const parseAIResponse = useCallback((text: string): Partial<TokenUsage> => {
    const result: Partial<TokenUsage> = {};
    
    // 尝试多种格式解析
    const patterns = [
      /cache\s*read[:\s]*([0-9,]+)/i,
      /cache\s*write[:\s]*([0-9,]+)/i,
      /input[:\s]*([0-9,]+)/i,
      /output[:\s]*([0-9,]+)/i,
      /total[:\s]*([0-9,]+)/i,
    ];

    const keys: (keyof TokenUsage)[] = ['cacheRead', 'cacheWrite', 'input', 'output', 'total'];
    
    patterns.forEach((pattern, index) => {
      const match = text.match(pattern);
      if (match) {
        const numStr = match[1].replace(/,/g, '');
        result[keys[index]] = parseInt(numStr) || 0;
      }
    });

    return result;
  }, []);

  // 调用 AI 识别图片
  const recognizeImage = useCallback(async (base64Image: string) => {
    setIsProcessing(true);
    try {
      // 调用后端 AI 服务识别图片
      const response = await aiService.parseImageTokenUsage(
        `请识别这张图片中的 token 使用统计数据。提取以下数值：
1. Cache Read (缓存读取)
2. Cache Write (缓存写入)
3. Input (输入)
4. Output (输出)
5. Total (总计)

请以 JSON 格式返回，例如：
{"cacheRead": 92258867, "cacheWrite": 3352546, "input": 1592822, "output": 699243, "total": 97903478}

只返回 JSON，不要其他文字。`,
        base64Image,
      );

      const data = response.data;
      
      if (data && data.message) {
        const content = data.message;
        // 尝试解析 JSON
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const newUsage: TokenUsage = {
              cacheRead: parsed.cacheRead || 0,
              cacheWrite: parsed.cacheWrite || 0,
              input: parsed.input || 0,
              output: parsed.output || 0,
              total: parsed.total || 0,
            };
            // 如果没有 total，计算它
            if (!newUsage.total) {
              newUsage.total = newUsage.cacheRead + newUsage.cacheWrite + 
                              newUsage.input + newUsage.output;
            }
            setUsage(newUsage);
            toast.success('已识别图片中的数据');
            return;
          }
        } catch {
          // JSON 解析失败，尝试文本解析
        }
        
        // 尝试文本解析
        const parsed = parseAIResponse(content);
        if (Object.keys(parsed).length > 0) {
          const newUsage: TokenUsage = {
            cacheRead: parsed.cacheRead || 0,
            cacheWrite: parsed.cacheWrite || 0,
            input: parsed.input || 0,
            output: parsed.output || 0,
            total: parsed.total || 0,
          };
          if (!newUsage.total) {
            newUsage.total = newUsage.cacheRead + newUsage.cacheWrite + 
                            newUsage.input + newUsage.output;
          }
          setUsage(newUsage);
          toast.success('已识别图片中的数据');
          return;
        }
      }
      
      toast.info('无法自动识别，请手动输入数值');
    } catch (error: unknown) {
      console.error('图片识别失败:', error);
      const errorMsg =
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof (error as { message?: unknown }).message === 'string'
          ? (error as { message: string }).message
          : '未知错误';
      toast.error(`图片识别失败: ${errorMsg}`);
    } finally {
      setIsProcessing(false);
    }
  }, [parseAIResponse]);

  // 处理图片（上传或粘贴）
  const handleImage = useCallback(async (file: File | Blob) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setImagePreview(base64);
      await recognizeImage(base64);
    };
    reader.readAsDataURL(file);
  }, [recognizeImage]);

  // 处理文件上传
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleImage(file);
    }
  };

  // 全局粘贴监听
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      // 检查是否在输入框中，如果是则不处理
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            await handleImage(file);
          }
          break;
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handleImage]);

  // 更新单个数值
  const updateValue = (field: keyof TokenUsage, value: string) => {
    const numValue = parseInt(value.replace(/,/g, '')) || 0;
    const newUsage = { ...usage, [field]: numValue };
    newUsage.total = newUsage.cacheRead + newUsage.cacheWrite + newUsage.input + newUsage.output;
    setUsage(newUsage);
  };

  // 格式化数字
  const formatNumber = (num: number) => num.toLocaleString();
  const formatCurrency = (num: number) => `$${num.toFixed(4)}`;

  const costs = calculateCost(usage);

  return (
    <Card ref={containerRef}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-primary" />
          Claude 4.5 Opus 费用计算器
        </CardTitle>
        <CardDescription>
          直接按 Ctrl+V 粘贴截图，或上传图片，自动识别并计算费用
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 图片区域 */}
        <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition-colors">
          {isProcessing ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">正在识别图片中的数据...</p>
            </div>
          ) : imagePreview ? (
            <div className="space-y-3">
              <div className="relative mx-auto h-48 w-full max-w-md overflow-hidden rounded border">
                <NextImage
                  src={imagePreview}
                  alt="上传截图预览"
                  fill
                  unoptimized
                  className="object-contain"
                />
              </div>
              <div className="flex justify-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setImagePreview(null)}
                >
                  清除图片
                </Button>
                <Button 
                  variant="secondary" 
                  size="sm"
                  onClick={() => recognizeImage(imagePreview)}
                >
                  <Sparkles className="h-4 w-4 mr-1" />
                  重新识别
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium mb-1">
                按 Ctrl+V 粘贴截图
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                或点击下方按钮选择图片文件
              </p>
              <label className="cursor-pointer">
                <input 
                  type="file" 
                  className="hidden" 
                  accept="image/*"
                  onChange={handleFileUpload}
                />
                <Button variant="secondary" size="sm" asChild>
                  <span><ImageIcon className="h-4 w-4 mr-2" /> 选择图片</span>
                </Button>
              </label>
            </>
          )}
        </div>

        {/* 手动输入区域 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cacheRead">Cache Read</Label>
            <Input
              id="cacheRead"
              type="text"
              placeholder="0"
              value={usage.cacheRead ? formatNumber(usage.cacheRead) : ''}
              onChange={(e) => updateValue('cacheRead', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cacheWrite">Cache Write</Label>
            <Input
              id="cacheWrite"
              type="text"
              placeholder="0"
              value={usage.cacheWrite ? formatNumber(usage.cacheWrite) : ''}
              onChange={(e) => updateValue('cacheWrite', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="input">Input</Label>
            <Input
              id="input"
              type="text"
              placeholder="0"
              value={usage.input ? formatNumber(usage.input) : ''}
              onChange={(e) => updateValue('input', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="output">Output</Label>
            <Input
              id="output"
              type="text"
              placeholder="0"
              value={usage.output ? formatNumber(usage.output) : ''}
              onChange={(e) => updateValue('output', e.target.value)}
            />
          </div>
        </div>

        {/* 费率说明 */}
        <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded">
          <p className="font-medium mb-1">费率（每百万 token）：</p>
          <div className="grid grid-cols-2 gap-1">
            <span>Input: ${RATES.input}</span>
            <span>Output: ${RATES.output}</span>
            <span>Cache Read: ${RATES.cacheRead}</span>
            <span>Cache Write: ${RATES.cacheWrite}</span>
          </div>
        </div>

        {/* 计算结果 */}
        <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 p-4 rounded-lg space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            费用明细
          </h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cache Read:</span>
              <span>{formatCurrency(costs.cacheRead)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cache Write:</span>
              <span>{formatCurrency(costs.cacheWrite)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Input:</span>
              <span>{formatCurrency(costs.input)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Output:</span>
              <span>{formatCurrency(costs.output)}</span>
            </div>
          </div>
          <div className="border-t pt-3 flex justify-between items-center">
            <span className="font-medium">总计</span>
            <span className="text-2xl font-bold text-chart-3">
              ${costs.total.toFixed(2)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            总 token 数: {formatNumber(usage.total)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
