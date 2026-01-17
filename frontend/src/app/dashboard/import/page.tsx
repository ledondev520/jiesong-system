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
  Package,
  Building2,
  Store,
  Container,
  FileText,
} from 'lucide-react';
import {
  previewCSV,
  executeImport,
  getImportHistory,
  getDatabaseStats,
  PreviewResult,
  ImportResult,
  ImportHistory,
  DatabaseStats,
  NewRecord,
} from '@/services/dataImportService';

type ImportStep = 'upload' | 'preview' | 'importing' | 'result';

export default function DataImportPage() {
  // 0. 状态管理
  const [step, setStep] = useState<ImportStep>('upload');
  const [file, setFile] = useState<File | null>(null);
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
    
    setFile(selectedFile);
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
    setFile(null);
    setPreviewData(null);
    setImportResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ==================== 渲染部分 ====================

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* 页面标题 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <FileSpreadsheet className="w-8 h-8 text-emerald-400" />
            数据导入中心
          </h1>
          <p className="text-slate-400 mt-2">
            上传CSV文件，系统将自动对比并导入新增数据
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 主区域 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 步骤指示器 */}
            <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-4">
              <div className="flex items-center justify-between">
                {[
                  { key: 'upload', label: '上传文件', icon: Upload },
                  { key: 'preview', label: '预览对比', icon: FileSpreadsheet },
                  { key: 'importing', label: '导入中', icon: RefreshCw },
                  { key: 'result', label: '完成', icon: CheckCircle },
                ].map((s, i) => (
                  <div key={s.key} className="flex items-center">
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                      step === s.key 
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                        : 'text-slate-400'
                    }`}>
                      <s.icon className={`w-5 h-5 ${step === s.key && s.key === 'importing' ? 'animate-spin' : ''}`} />
                      <span className="font-medium">{s.label}</span>
                    </div>
                    {i < 3 && <ArrowRight className="w-5 h-5 text-slate-600 mx-2" />}
                  </div>
                ))}
              </div>
            </div>

            {/* 错误提示 */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
                <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <span className="text-red-400">{error}</span>
              </div>
            )}

            {/* 上传区域 */}
            {step === 'upload' && (
              <div 
                className={`bg-slate-800/50 backdrop-blur border-2 border-dashed rounded-xl p-12 text-center transition-all ${
                  dragActive 
                    ? 'border-emerald-400 bg-emerald-500/10' 
                    : 'border-slate-600 hover:border-slate-500'
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
                
                <Upload className={`w-16 h-16 mx-auto mb-4 ${dragActive ? 'text-emerald-400' : 'text-slate-500'}`} />
                
                <h3 className="text-xl font-semibold text-white mb-2">
                  {loading ? '正在解析...' : '拖拽CSV文件到这里'}
                </h3>
                <p className="text-slate-400 mb-6">
                  或者点击按钮选择文件
                </p>
                
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      解析中...
                    </span>
                  ) : (
                    '选择文件'
                  )}
                </button>
                
                <p className="text-slate-500 text-sm mt-4">
                  支持格式：CSV（与出货汇总表格式一致）
                </p>
              </div>
            )}

            {/* 预览区域 */}
            {step === 'preview' && previewData && (
              <div className="space-y-6">
                {/* 文件信息 */}
                <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                      {previewData.fileName}
                    </h3>
                    <button
                      onClick={handleReset}
                      className="text-slate-400 hover:text-white text-sm"
                    >
                      重新上传
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-slate-700/50 rounded-lg p-3">
                      <div className="text-2xl font-bold text-white">{previewData.analysis.totalRows}</div>
                      <div className="text-slate-400 text-sm">总记录数</div>
                    </div>
                    <div className="bg-emerald-500/10 rounded-lg p-3 border border-emerald-500/30">
                      <div className="text-2xl font-bold text-emerald-400">{previewData.comparison.summary.new}</div>
                      <div className="text-slate-400 text-sm">新增记录</div>
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-3">
                      <div className="text-2xl font-bold text-slate-300">{previewData.comparison.summary.existing}</div>
                      <div className="text-slate-400 text-sm">已存在</div>
                    </div>
                    <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/30">
                      <div className="text-2xl font-bold text-amber-400">{previewData.comparison.summary.invalid}</div>
                      <div className="text-slate-400 text-sm">无效记录</div>
                    </div>
                  </div>
                </div>

                {/* 缺失序号提示 */}
                {previewData.analysis.missingSeqs.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-amber-400 flex items-center gap-2 mb-3">
                      <FileWarning className="w-5 h-5" />
                      缺失序号提醒（共 {previewData.analysis.missingSeqs.length} 个）
                    </h3>
                    <p className="text-slate-300 mb-3">
                      以下序号在文件中缺失，请检查数据完整性：
                    </p>
                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                      {previewData.analysis.missingSeqs.map(seq => (
                        <span key={seq} className="px-2 py-1 bg-amber-500/20 text-amber-300 text-sm rounded">
                          {seq}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 新增记录预览 */}
                {previewData.comparison.newRecords.length > 0 && (
                  <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-slate-700">
                      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                        将导入的新记录（显示前 {Math.min(previewData.comparison.newRecords.length, 50)} 条）
                      </h3>
                    </div>
                    <div className="overflow-x-auto max-h-80 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-700/50 sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left text-slate-300">序号</th>
                            <th className="px-4 py-3 text-left text-slate-300">报关名</th>
                            <th className="px-4 py-3 text-left text-slate-300">门店</th>
                            <th className="px-4 py-3 text-left text-slate-300">货柜</th>
                            <th className="px-4 py-3 text-right text-slate-300">数量</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                          {previewData.comparison.newRecords.slice(0, 50).map((record, i) => (
                            <tr key={i} className="hover:bg-slate-700/30">
                              <td className="px-4 py-2 text-emerald-400">{record.seq}</td>
                              <td className="px-4 py-2 text-white">{record.customsName}</td>
                              <td className="px-4 py-2 text-slate-300">{record.storeName || '-'}</td>
                              <td className="px-4 py-2 text-slate-300">{record.containerNo || '-'}</td>
                              <td className="px-4 py-2 text-right text-slate-300">{record.quantity || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 无效记录 */}
                {previewData.comparison.invalidRecords.length > 0 && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                    <h3 className="text-lg font-semibold text-red-400 flex items-center gap-2 mb-3">
                      <XCircle className="w-5 h-5" />
                      无效记录（将跳过）
                    </h3>
                    <div className="space-y-2">
                      {previewData.comparison.invalidRecords.map((record, i) => (
                        <div key={i} className="text-sm text-red-300">
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
                    className="px-6 py-3 bg-slate-600 hover:bg-slate-500 text-white rounded-lg font-medium transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={previewData.comparison.summary.new === 0}
                    className="flex-1 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Upload className="w-5 h-5" />
                    确认导入 {previewData.comparison.summary.new} 条新记录
                  </button>
                </div>
              </div>
            )}

            {/* 导入中 */}
            {step === 'importing' && (
              <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-12 text-center">
                <RefreshCw className="w-16 h-16 mx-auto mb-4 text-emerald-400 animate-spin" />
                <h3 className="text-xl font-semibold text-white mb-2">正在导入数据...</h3>
                <p className="text-slate-400">请稍候，这可能需要一些时间</p>
              </div>
            )}

            {/* 导入结果 */}
            {step === 'result' && importResult && (
              <div className="space-y-6">
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <CheckCircle className="w-8 h-8 text-emerald-400" />
                    <h3 className="text-xl font-semibold text-emerald-400">导入完成</h3>
                  </div>
                  <p className="text-white text-lg">{importResult.message}</p>
                </div>

                {/* 创建统计 */}
                <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">新增数据统计</h3>
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
                      <div key={item.label} className="bg-slate-700/50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <item.icon className="w-4 h-4 text-emerald-400" />
                          <span className="text-slate-400 text-sm">{item.label}</span>
                        </div>
                        <div className="text-xl font-bold text-white">+{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 失败记录 */}
                {importResult.result.failed.length > 0 && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                    <h3 className="text-lg font-semibold text-red-400 flex items-center gap-2 mb-3">
                      <AlertTriangle className="w-5 h-5" />
                      导入失败的记录
                    </h3>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {importResult.result.failed.map((record, i) => (
                        <div key={i} className="text-sm text-red-300">
                          序号 {record.seq}: {record.reason}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={handleReset}
                  className="w-full px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors"
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
              <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                  <Database className="w-5 h-5 text-emerald-400" />
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
                      <span className="text-slate-400">{item.label}</span>
                      <span className="text-white font-medium">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 导入历史 */}
            <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                <History className="w-5 h-5 text-emerald-400" />
                导入历史
              </h3>
              {history.length === 0 ? (
                <p className="text-slate-400 text-sm">暂无导入记录</p>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {history.map(record => (
                    <div key={record.id} className="bg-slate-700/50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white text-sm font-medium truncate">
                          {record.fileName}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          record.status === 'COMPLETED' 
                            ? 'bg-emerald-500/20 text-emerald-400' 
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {record.status === 'COMPLETED' ? '成功' : '失败'}
                        </span>
                      </div>
                      <div className="text-slate-400 text-xs">
                        {new Date(record.importedAt).toLocaleString('zh-CN')}
                      </div>
                      <div className="text-slate-400 text-xs">
                        成功 {record.successRows} / 失败 {record.failedRows}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 使用说明 */}
            <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">使用说明</h3>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">1.</span>
                  上传与"出货汇总"格式一致的CSV文件
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">2.</span>
                  系统自动对比数据库，识别新增记录
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">3.</span>
                  检查缺失序号，确认无误后导入
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">4.</span>
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
