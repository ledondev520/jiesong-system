/**
 * Input: AgentAccount 数据（编辑模式）或空（新建模式）
 * Output: Agent 账号新建/编辑对话框，仅包含名称、slug、描述、状态
 * Pos: 账号管理页面（users/page.tsx）的共享对话框组件
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { AgentAccount } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const agentSchema = z.object({
  name: z.string().min(1, 'Agent 名称必填'),
  slug: z.string().min(1, 'slug 必填'),
  description: z.string().optional(),
  status: z.string().min(1, '状态必填'),
});

type AgentDialogFormValues = z.infer<typeof agentSchema>;

type AgentDialogSubmitPayload = {
  name: string;
  slug: string;
  description?: string;
  status: string;
};

interface AgentAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent?: AgentAccount | null;
  onSubmit: (data: AgentDialogSubmitPayload) => Promise<void>;
}

export function AgentAccountDialog({
  open,
  onOpenChange,
  agent,
  onSubmit,
}: AgentAccountDialogProps) {
  const form = useForm<AgentDialogFormValues>({
    resolver: zodResolver(agentSchema),
    defaultValues: {
      name: '',
      slug: '',
      description: '',
      status: 'ACTIVE',
    },
    values: agent ? {
      name: agent.name,
      slug: agent.slug,
      description: agent.description || '',
      status: agent.status,
    } : undefined,
  });

  const handleSubmit = async (data: AgentDialogFormValues) => {
    await onSubmit({
      name: data.name.trim(),
      slug: data.slug.trim(),
      description: data.description?.trim() || '',
      status: data.status,
    });
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{agent ? '编辑 Agent' : '新增 Agent'}</DialogTitle>
          <DialogDescription>
            Agent 账号用于 CLI / MCP / 外部自动化访问。当前实现会自动附加固定能力集，暂不支持在这里逐项勾选权限。
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>名称</FormLabel>
                  <FormControl>
                    <Input placeholder="例如：采购机器人" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug</FormLabel>
                    <FormControl>
                      <Input placeholder="例如：purchase-bot" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>状态</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ACTIVE">启用</SelectItem>
                        <SelectItem value="DISABLED">停用</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>描述（可选）</FormLabel>
                  <FormControl>
                    <Textarea placeholder="例如：供 OpenClaw 执行采购查询与录入" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? '保存中...' : '保存'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
