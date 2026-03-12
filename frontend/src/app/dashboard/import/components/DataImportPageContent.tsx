/**
 * Input: dataImportService
 * Output: 数据导入页面
 * Pos: 前端数据导入界面，支持CSV上传、预览、对比、导入
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { 
  Upload, 
  FileSpreadsheet, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  RefreshCw,
  History,
  Database,
  FileWarning,
  ArrowRight,
  ArrowLeft,
  Package,
  Building2,
  Store,
  Container,
  FileText,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  previewCSV,
  executeImport,
  getImportHistory,
  getDatabaseStats,
  PreviewResult,
  ImportResult,
  ImportHistory,
  DatabaseStats,
} from '@/services/dataImportService';

type ImportStep = 'upload' | 'preview' | 'importing' | 'result';

export default function DataImportPage() {
  const router = useRouter();
  
  // 0. 状态管理
  const [step, setStep] = useState<ImportStep>('upload');
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [history, setHistory] = useState<ImportHistory[]>([]);
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. 加载历史和统计数据
  useEffect(() => {
    const loadData = async () => {
      try {
        const [historyData, statsData] = await Promise.all([
          getImportHistory(),
          getDatabaseStats(),
        ]);
        setHistory(historyData);
        setStats(statsData);
      } catch (err) {
        console.error('加载数据失败:', err);
      }
    };
    loadData();
  }, []);

  // 2. 处理文件选择
  const handleFileSelect = useCallback(async (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.csv')) {
      setError('请上传CSV格式的文件');
      return;
    }
    
    setError(null);
    setLoading(true);
    
    try {
      const result = await previewCSV(selectedFile);
      setPreviewData(result);
      setStep('preview');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '文件解析失败';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  // 3. 拖拽处理
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }, [handleFileSelect]);

  // 4. 执行导入
  const handleImport = async () => {
    if (!previewData?.fullNewRecords?.length) {
      setError('没有需要导入的新数据');
      return;
    }
    
    setStep('importing');
    setLoading(true);
    setError(null);
    
    try {
      const result = await executeImport(previewData.fullNewRecords);
      setImportResult(result);
      setStep('result');
      
      // 刷新统计数据
      const newStats = await getDatabaseStats();
      setStats(newStats);
      
      // 刷新历史
      const newHistory = await getImportHistory();
      setHistory(newHistory);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '导入失败';
      setError(errorMessage);
      setStep('preview');
    } finally {
      setLoading(false);
    }
  };

  // 5. 重置
  const handleReset = () => {
    setStep('upload');
    setPreviewData(null);
    setImportResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ==================== 渲染部分 ====================

  return (
    <div className="space-y-6">
      <PageHeader
        title="数据导入中心"
        description="上传 CSV，预览新增差异，再用统一流程导入业务数据。"
        backHref="/dashboard/settings?tab=import"
      />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 主区域 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 步骤指示器 */}
            <Card>
              <CardContent className="p-4">
              <div className="flex items-center justify-between">
                {[
                  { key: 'upload', label: '上传文件', icon: Upload },
                  { key: 'preview', label: '预览对比', icon: FileSpreadsheet },
                  { key: 'importing', label: '导入中', icon: RefreshCw },
                  { key: 'result', label: '完成', icon: CheckCircle },
                ].map((s, i) => (
                  <div key={s.key} className="flex items-center">
                    <div className={`flex items-center gap-2 rounded-lg px-4 py-2 transition-colors ${
                      step === s.key 
                        ? 'border border-primary/20 bg-primary/10 text-primary' 
                        : 'text-muted-foreground'
                    }`}>
                      <s.icon className={`w-5 h-5 ${step === s.key && s.key === 'importing' ? 'animate-spin' : ''}`} />
                      <span className="font-medium">{s.label}</span>
                    </div>
                    {i < 3 && <ArrowRight className="w-5 h-5 text-muted-foreground mx-2" />}
                  </div>
                ))}
              </div>
              </CardContent>
            </Card>

            {/* 错误提示 */}
            {error && (
              <Card className="border-destructive/30 bg-destructive/10">
                <CardContent className="flex items-center gap-3 p-4">
                <XCircle className="w-5 h-5 text-destructive flex-shrink-0" />
                <span className="text-destructive">{error}</span>
                </CardContent>
              </Card>
            )}

            {/* 上传区域 */}
            {step === 'upload' && (
              <Card 
                className={`border-2 border-dashed text-center transition-colors ${
                  dragActive 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border hover:border-primary/40'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                />
                
                <CardContent className="p-12">
                <Upload className={`w-16 h-16 mx-auto mb-4 ${dragActive ? 'text-primary' : 'text-muted-foreground'}`} />
                
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  {loading ? '正在解析...' : '拖拽CSV文件到这里'}
                </h3>
                <p className="text-muted-foreground mb-6">
                  或者点击按钮选择文件
                </p>
                
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      解析中...
                    </span>
                  ) : (
                    '选择文件'
                  )}
                </Button>
                
                <p className="text-muted-foreground text-sm mt-4">
                  支持格式：CSV（与出货汇总表格式一致）
                </p>
                </CardContent>
              </Card>
            )}

            {/* 预览区域 */}
            {step === 'preview' && previewData && (
              <div className="space-y-6">
                {/* 文件信息 */}
                <div className="bg-card/70 backdrop-blur border border-border/70 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                      <FileSpreadsheet className="w-5 h-5 text-chart-3" />
                      {previewData.fileName}
                    </h3>
                    <button
                      onClick={handleReset}
                      className="text-muted-foreground hover:text-foreground text-sm"
                    >
                      重新上传
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-muted/55 rounded-lg p-3">
                      <div className="text-2xl font-bold text-foreground">{previewData.analysis.totalRows}</div>
                      <div className="text-muted-foreground text-sm">总记录数</div>
                    </div>
                    <div className="bg-chart-3/10 rounded-lg p-3 border border-chart-3/30">
                      <div className="text-2xl font-bold text-chart-3">{previewData.comparison.summary.new}</div>
                      <div className="text-muted-foreground text-sm">新增记录</div>
                    </div>
                    <div className="bg-muted/55 rounded-lg p-3">
                      <div className="text-2xl font-bold text-foreground/85">{previewData.comparison.summary.existing}</div>
                      <div className="text-muted-foreground text-sm">已存在</div>
                    </div>
                    <div className="bg-chart-5/10 rounded-lg p-3 border border-chart-5/30">
                      <div className="text-2xl font-bold text-chart-5">{previewData.comparison.summary.invalid}</div>
                      <div className="text-muted-foreground text-sm">无效记录</div>
                    </div>
                  </div>
                </div>

                {/* 缺失序号提示 */}
                {previewData.analysis.missingSeqs.length > 0 && (
                  <div className="bg-chart-5/10 border border-chart-5/30 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-chart-5 flex items-center gap-2 mb-3">
                      <FileWarning className="w-5 h-5" />
                      缺失序号提醒（共 {previewData.analysis.missingSeqs.length} 个）
                    </h3>
                    <p className="text-foreground/85 mb-3">
                      以下序号在文件中缺失，请检查数据完整性：
                    </p>
                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                      {previewData.analysis.missingSeqs.map(seq => (
                        <span key={seq} className="px-2 py-1 bg-chart-5/20 text-chart-5/85 text-sm rounded">
                          {seq}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 新增记录预览 */}
                {previewData.comparison.newRecords.length > 0 && (
                  <div className="bg-card/70 backdrop-blur border border-border/70 rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-border/70">
                      <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-chart-3" />
                        将导入的新记录（显示前 {Math.min(previewData.comparison.newRecords.length, 50)} 条）
                      </h3>
                    </div>
                    <div className="overflow-x-auto max-h-80 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/55 sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left text-foreground/85">序号</th>
                            <th className="px-4 py-3 text-left text-foreground/85">报关名</th>
                            <th className="px-4 py-3 text-left text-foreground/85">门店</th>
                            <th className="px-4 py-3 text-left text-foreground/85">货柜</th>
                            <th className="px-4 py-3 text-right text-foreground/85">数量</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {previewData.comparison.newRecords.slice(0, 50).map((record, i) => (
                            <tr key={i} className="hover:bg-muted/40">
                              <td className="px-4 py-2 text-chart-3">{record.seq}</td>
                              <td className="px-4 py-2 text-foreground">{record.customsName}</td>
                              <td className="px-4 py-2 text-foreground/85">{record.storeName || '-'}</td>
                              <td className="px-4 py-2 text-foreground/85">{record.containerNo || '-'}</td>
                              <td className="px-4 py-2 text-right text-foreground/85">{record.quantity || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 无效记录 */}
                {previewData.comparison.invalidRecords.length > 0 && (
                  <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4">
                    <h3 className="text-lg font-semibold text-destructive flex items-center gap-2 mb-3">
                      <XCircle className="w-5 h-5" />
                      无效记录（将跳过）
                    </h3>
                    <div className="space-y-2">
                      {previewData.comparison.invalidRecords.map((record, i) => (
                        <div key={i} className="text-sm text-destructive/85">
                          序号 {record.seq}: {record.reason}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="flex gap-4">
                  <button
                    onClick={handleReset}
                    className="px-6 py-3 bg-muted hover:bg-muted/75 text-foreground rounded-lg font-medium transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={previewData.comparison.summary.new === 0}
                    className="flex-1 px-6 py-3 bg-chart-3 hover:bg-chart-3/90 text-foreground rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Upload className="w-5 h-5" />
                    确认导入 {previewData.comparison.summary.new} 条新记录
                  </button>
                </div>
              </div>
            )}

            {/* 导入中 */}
            {step === 'importing' && (
              <div className="bg-card/70 backdrop-blur border border-border/70 rounded-xl p-12 text-center">
                <RefreshCw className="w-16 h-16 mx-auto mb-4 text-chart-3 animate-spin" />
                <h3 className="text-xl font-semibold text-foreground mb-2">正在导入数据...</h3>
                <p className="text-muted-foreground">请稍候，这可能需要一些时间</p>
              </div>
            )}

            {/* 导入结果 */}
            {step === 'result' && importResult && (
              <div className="space-y-6">
                <div className="bg-chart-3/10 border border-chart-3/30 rounded-xl p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <CheckCircle className="w-8 h-8 text-chart-3" />
                    <h3 className="text-xl font-semibold text-chart-3">导入完成</h3>
                  </div>
                  <p className="text-foreground text-lg">{importResult.message}</p>
                </div>

                {/* 创建统计 */}
                <div className="bg-card/70 backdrop-blur border border-border/70 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4">新增数据统计</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: '供应商', value: importResult.result.created.suppliers, icon: Building2 },
                      { label: '商品', value: importResult.result.created.products, icon: Package },
                      { label: '门店', value: importResult.result.created.stores, icon: Store },
                      { label: '货柜', value: importResult.result.created.containers, icon: Container },
                      { label: '销售合同', value: importResult.result.created.salesContracts, icon: FileText },
                      { label: '采购合同', value: importResult.result.created.purchaseContracts, icon: FileText },
                      { label: '装箱明细', value: importResult.result.created.containerItems, icon: Package },
                      { label: '库存记录', value: importResult.result.created.inventories, icon: Database },
                    ].map(item => (
                      <div key={item.label} className="bg-muted/55 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <item.icon className="w-4 h-4 text-chart-3" />
                          <span className="text-muted-foreground text-sm">{item.label}</span>
                        </div>
                        <div className="text-xl font-bold text-foreground">+{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 失败记录 */}
                {importResult.result.failed.length > 0 && (
                  <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4">
                    <h3 className="text-lg font-semibold text-destructive flex items-center gap-2 mb-3">
                      <AlertTriangle className="w-5 h-5" />
                      导入失败的记录
                    </h3>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {importResult.result.failed.map((record, i) => (
                        <div key={i} className="text-sm text-destructive/85">
                          序号 {record.seq}: {record.reason}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={handleReset}
                  className="w-full px-6 py-3 bg-chart-3 hover:bg-chart-3/90 text-foreground rounded-lg font-medium transition-colors"
                >
                  继续导入其他数据
                </button>
              </div>
            )}
          </div>

          {/* 侧边栏 */}
          <div className="space-y-6">
            {/* 数据库统计 */}
            {stats && (
              <div className="bg-card/70 backdrop-blur border border-border/70 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
                  <Database className="w-5 h-5 text-chart-3" />
                  数据库统计
                </h3>
                <div className="space-y-3">
                  {[
                    { label: '供应商', value: stats.suppliers },
                    { label: '商品', value: stats.products },
                    { label: '门店', value: stats.stores },
                    { label: '货柜', value: stats.containers },
                    { label: '装箱明细', value: stats.containerItems },
                    { label: '销售合同', value: stats.salesContracts },
                    { label: '采购合同', value: stats.purchaseContracts },
                    { label: '库存记录', value: stats.inventories },
                  ].map(item => (
                    <div key={item.label} className="flex justify-between items-center">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="text-foreground font-medium">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 导入历史 */}
            <div className="bg-card/70 backdrop-blur border border-border/70 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
                <History className="w-5 h-5 text-chart-3" />
                导入历史
              </h3>
              {history.length === 0 ? (
                <p className="text-muted-foreground text-sm">暂无导入记录</p>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {history.map(record => (
                    <div key={record.id} className="bg-muted/55 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-foreground text-sm font-medium truncate">
                          {record.fileName}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          record.status === 'COMPLETED' 
                            ? 'bg-chart-3/20 text-chart-3' 
                            : 'bg-destructive/15 text-destructive'
                        }`}>
                          {record.status === 'COMPLETED' ? '成功' : '失败'}
                        </span>
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {new Date(record.importedAt).toLocaleString('zh-CN')}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        成功 {record.successRows} / 失败 {record.failedRows}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 使用说明 */}
            <div className="bg-card/70 backdrop-blur border border-border/70 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">使用说明</h3>
              <ul className="space-y-2 text-muted-foreground text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-chart-3">1.</span>
                  上传与“出货汇总”格式一致的CSV文件
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-chart-3">2.</span>
                  系统自动对比数据库，识别新增记录
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-chart-3">3.</span>
                  检查缺失序号，确认无误后导入
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-chart-3">4.</span>
                  已存在的记录会自动跳过，不会重复导入
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
