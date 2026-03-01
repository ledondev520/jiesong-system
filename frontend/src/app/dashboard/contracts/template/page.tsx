/**
 * Input: 合同模板服务
 * Output: 合同模板上传页面
 * Pos: 合同管理子页面
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { contractDocService } from '@/services/contractDoc.service';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface TemplateInfoItem {
  exists: boolean;
  filename?: string;
  size?: number;
  updatedAt?: string;
}

export default function ContractTemplateUploadPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [exists, setExists] = useState(false);
  const [templateInfo, setTemplateInfo] = useState<TemplateInfoItem | null>(null);

  const loadStatus = useCallback(async () => {
    setChecking(true);
    try {
      const [statusRes, listRes] = await Promise.all([
        contractDocService.checkTemplate(),
        contractDocService.getTemplates(),
      ]);
      setExists(Boolean(statusRes.data?.exists));
      setTemplateInfo((listRes.data?.items || [])[0] || null);
    } catch {
      toast.error('加载模板状态失败');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const templateMetaText = useMemo(() => {
    if (!templateInfo) {
      return '当前尚未上传模板。';
    }
    const size = typeof templateInfo.size === 'number' ? `${(templateInfo.size / 1024).toFixed(1)} KB` : '-';
    const updatedAt = templateInfo.updatedAt ? format(new Date(templateInfo.updatedAt), 'yyyy-MM-dd HH:mm') : '-';
    return `文件: ${templateInfo.filename || '-'} | 大小: ${size} | 更新时间: ${updatedAt}`;
  }, [templateInfo]);

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('请先选择模板文件');
      return;
    }

    if (!selectedFile.name.toLowerCase().endsWith('.docx')) {
      toast.error('仅支持 .docx 模板文件');
      return;
    }

    setUploading(true);
    try {
      await contractDocService.uploadTemplate(selectedFile);
      toast.success('模板上传成功');
      setSelectedFile(null);
      await loadStatus();
    } catch {
      toast.error('模板上传失败');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="模板上传"
        description="上传采购合同生成所需的 Word 模板（.docx）"
        backHref="/dashboard/contracts"
        backLabel="返回合同列表"
      />

      <Card>
        <CardHeader>
          <CardTitle>当前模板状态</CardTitle>
          <CardDescription>{checking ? '检查中...' : exists ? '模板已配置，可用于合同生成。' : '模板未配置，请先上传。'}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{checking ? '加载中...' : templateMetaText}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>上传新模板</CardTitle>
          <CardDescription>模板中的占位符将用于自动填充合同信息。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            type="file"
            accept=".docx"
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              setSelectedFile(file);
            }}
          />
          <div className="flex items-center justify-end">
            <Button onClick={() => void handleUpload()} disabled={uploading}>
              {uploading ? '上传中...' : '上传模板'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
