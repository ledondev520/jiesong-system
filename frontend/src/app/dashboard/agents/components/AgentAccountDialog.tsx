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
  defaultMode: z.string().min(1, '默认模式必填'),
  capabilitiesText: z.string().optional(),
});

type AgentDialogFormValues = z.infer<typeof agentSchema>;

type AgentDialogSubmitPayload = {
  name: string;
  slug: string;
  description?: string;
  status: string;
  defaultMode: string;
  grants: Array<{ resource: string; action: string }>;
};

interface AgentAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent?: AgentAccount | null;
  onSubmit: (data: AgentDialogSubmitPayload) => Promise<void>;
}

const serializeCapabilities = (agent?: AgentAccount | null) => (
  agent?.grants?.map((grant) => `${grant.resource}.${grant.action}`).join('\n') || 'search.read\npurchase.create\nsupplier.create'
);

const parseCapabilities = (text: string | undefined) => (
  String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((capability) => {
      const [resource, action] = capability.split('.');
      return { resource, action };
    })
    .filter((item) => item.resource && item.action)
);

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
      defaultMode: 'READ_INGEST',
      capabilitiesText: 'search.read\npurchase.create\nsupplier.create',
    },
    values: agent ? {
      name: agent.name,
      slug: agent.slug,
      description: agent.description || '',
      status: agent.status,
      defaultMode: agent.defaultMode,
      capabilitiesText: serializeCapabilities(agent),
    } : undefined,
  });

  const handleSubmit = async (data: AgentDialogFormValues) => {
    await onSubmit({
      name: data.name.trim(),
      slug: data.slug.trim(),
      description: data.description?.trim() || '',
      status: data.status,
      defaultMode: data.defaultMode,
      grants: parseCapabilities(data.capabilitiesText),
    });
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{agent ? '编辑 Agent' : '新增 Agent'}</DialogTitle>
          <DialogDescription>
            Agent 账号用于 CLI / MCP / 外部自动化访问。签发 token 后仅显示一次，请立即保存。
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
                        <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                        <SelectItem value="DISABLED">DISABLED</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="defaultMode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>默认模式</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="READ_ONLY">READ_ONLY</SelectItem>
                      <SelectItem value="READ_INGEST">READ_INGEST</SelectItem>
                      <SelectItem value="CUSTOM">CUSTOM</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>描述</FormLabel>
                  <FormControl>
                    <Textarea placeholder="例如：供 OpenClaw 执行采购查询与录入" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="capabilitiesText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>能力清单</FormLabel>
                  <FormControl>
                    <Textarea
                      id="agent-capabilities"
                      name="capabilitiesText"
                      className="min-h-32 font-mono text-sm"
                      placeholder={'search.read\npurchase.create\nsupplier.create'}
                      {...field}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">每行一个 capability，格式：`resource.action`</p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? '保存中...' : '保存 Agent'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
