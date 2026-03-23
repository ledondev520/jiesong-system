/**
 * Input: 商品列表批量导入 HSCode
 * Output: 批量导入对话框组件
 * Pos: 商品管理/报关单创建共享组件
 */

'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { hsCodeService, type BatchHsCodeMatchResult } from '@/services/hsCode.service';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, AlertCircle, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface BatchImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: (results: BatchHsCodeMatchResult[]) => void;
}

const CONFIDENCE_CONFIG = {
  exact: { label: '精确匹配', color: 'bg-green-500', icon: CheckCircle2 },
  high: { label: '高置信', color: 'bg-blue-500', icon: CheckCircle2 },
  low: { label: '低置信', color: 'bg-yellow-500', icon: AlertCircle },
  none: { label: '未匹配', color: 'bg-red-500', icon: XCircle },
};

export function BatchImportDialog({
  open,
  onOpenChange,
  onImportComplete,
}: BatchImportDialogProps) {
  const [inputMode, setInputMode] = useState<'paste' | 'excel'>('paste');
  const [textInput, setTextInput] = useState('');
  const [fileName, setFileName] = useState('');
  const [matching, setMatching] = useState(false);
  const [results, setResults] = useState<BatchHsCodeMatchResult[]>([]);
  const [selectedResults, setSelectedResults] = useState<Map<string, BatchHsCodeMatchResult>>(new Map());

  const parseTextInput = () => {
    return textInput
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setTextInput(content);
    };
    reader.readAsText(file);
  };

  const handleBatchMatch = async () => {
    const productNames = parseTextInput();

    if (productNames.length === 0) {
      toast.error('请输入商品名称列表');
      return;
    }

    if (productNames.length > 100) {
      toast.error('单次最多匹配 100 个商品');
      return;
    }

    setMatching(true);
    try {
      const response = await hsCodeService.batchMatch(productNames);
      const matchResults = response.data || [];
      setResults(matchResults);

      // 自动选择匹配成功的
      const selected = new Map<string, BatchHsCodeMatchResult>();
      matchResults.forEach((r) => {
        if (r.match && r.confidence !== 'none') {
          selected.set(r.productName, r);
        }
      });
      setSelectedResults(selected);

      const successCount = matchResults.filter((r) => r.match).length;
      toast.success(`匹配完成：${successCount}/${matchResults.length} 个商品`);
    } catch {
      toast.error('HSCode 匹配失败');
    } finally {
      setMatching(false);
    }
  };

  const handleSelectMatch = (result: BatchHsCodeMatchResult) => {
    const newSelected = new Map(selectedResults);
    if (newSelected.has(result.productName)) {
      newSelected.delete(result.productName);
    } else if (result.match) {
      newSelected.set(result.productName, result);
    }
    setSelectedResults(newSelected);
  };

  const handleConfirm = () => {
    const confirmedResults = Array.from(selectedResults.values());
    onImportComplete(confirmedResults);
    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setTextInput('');
    setFileName('');
    setResults([]);
    setSelectedResults(new Map());
  };

  const handleClear = () => {
    resetForm();
  };

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      onOpenChange(newOpen);
      if (!newOpen) resetForm();
    }}>
      <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>批量导入商品 - HSCode 智能匹配</DialogTitle>
          <DialogDescription>
            粘贴商品名称列表或上传文件，系统将自动匹配 HSCode 和税率信息
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4">
          {/* 输入方式选择 */}
          <div className="flex gap-2 border-b pb-4">
            <Button
              variant={inputMode === 'paste' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setInputMode('paste')}
            >
              粘贴列表
            </Button>
            <Button
              variant={inputMode === 'excel' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setInputMode('excel')}
            >
              上传文件
            </Button>
          </div>

          {/* 输入区域 */}
          {inputMode === 'paste' ? (
            <div className="space-y-2">
              <Label>商品名称列表（每行一个）</Label>
              <Textarea
                placeholder="请输入商品名称，每行一个&#10;例如：&#10;瓷砖&#10;木地板&#10;不锈钢螺丝"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                className="min-h-[150px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                已输入 {parseTextInput().length} 个商品
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>上传 Excel/CSV 文件</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept=".txt,.csv"
                  onChange={handleFileUpload}
                  className="flex-1"
                />
                {fileName && (
                  <Button variant="ghost" size="sm" onClick={() => setFileName('')}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {fileName && (
                <p className="text-sm text-muted-foreground">已选择：{fileName}</p>
              )}
              <p className="text-xs text-muted-foreground">
                支持 .txt 或 .csv 格式，第一列为商品名称
              </p>
            </div>
          )}

          {/* 匹配按钮 */}
          {!results.length && (
            <Button
              onClick={handleBatchMatch}
              disabled={matching || parseTextInput().length === 0}
              className="w-full"
            >
              {matching ? '正在匹配...' : '开始 HSCode 智能匹配'}
            </Button>
          )}

          {/* 匹配结果 */}
          {results.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>匹配结果</Label>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleClear}>
                    清空重填
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleBatchMatch}>
                    重新匹配
                  </Button>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">选择</TableHead>
                      <TableHead>商品名称</TableHead>
                      <TableHead>HSCode</TableHead>
                      <TableHead>匹配结果</TableHead>
                      <TableHead>退税率</TableHead>
                      <TableHead>置信度</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((result) => {
                      const isSelected = selectedResults.has(result.productName);
                      const confidenceConfig = CONFIDENCE_CONFIG[result.confidence];
                      const ConfidenceIcon = confidenceConfig.icon;

                      return (
                        <TableRow
                          key={result.productName}
                          className={`cursor-pointer ${
                            isSelected ? 'bg-muted' : ''
                          } ${!result.match ? 'opacity-50' : ''}`}
                          onClick={() => result.match && handleSelectMatch(result)}
                        >
                          <TableCell>
                            {result.match ? (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleSelectMatch(result)}
                                onClick={(e) => e.stopPropagation()}
                                className="h-4 w-4"
                              />
                            ) : (
                              <XCircle className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="font-medium">
                            {result.productName}
                          </TableCell>
                          <TableCell className="font-mono">
                            {result.match?.hsCode || '-'}
                          </TableCell>
                          <TableCell>
                            {result.match ? (
                              <span className="text-sm">{result.match.productName}</span>
                            ) : (
                              <span className="text-sm text-muted-foreground">无匹配</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {result.match?.refundRate !== undefined && result.match.refundRate !== null ? (
                              `${result.match.refundRate}%`
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={`${confidenceConfig.color} text-white`}
                            >
                              <ConfidenceIcon className="h-3 w-3 mr-1" />
                              {confidenceConfig.label}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span>
                  匹配成功：{results.filter((r) => r.match).length} / {results.length}
                </span>
                <span>已选择：{selectedResults.size} 个商品</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedResults.size === 0}
          >
            确认导入 ({selectedResults.size} 个商品)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
