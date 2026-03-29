'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Bot, KeyRound, Plus, RefreshCw, ShieldCheck, ShieldX } from 'lucide-react';
import type { AgentAccount } from '@/types';
import { agentService } from '@/services/agent.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, ADMIN_TABS } from '@/components/layout/ModuleTabHeader';
import { toast } from 'sonner';
import { AgentAccountDialog } from './components/AgentAccountDialog';

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentAccount | null>(null);
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [oneTimeToken, setOneTimeToken] = useState('');
  const [tokenAction, setTokenAction] = useState<'issue' | 'rotate'>('issue');

  const getCredentialRisk = (expiresAt?: string | null) => {
    if (!expiresAt) return null;
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
    if (diffDays < 0) return 'expired';
    if (diffDays <= 14) return 'expiring';
    return null;
  };

  const loadAgents = async () => {
    setLoading(true);
    try {
      const response = await agentService.getAll({ page: 1, pageSize: 100 });
      setAgents(response.data?.items || []);
    } catch {
      toast.error('加载 Agent 列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const handleCreateOrUpdate = async (payload: Parameters<typeof agentService.create>[0]) => {
    try {
      if (editingAgent) {
        await agentService.update(editingAgent.id, payload);
        toast.success('Agent 更新成功');
      } else {
        await agentService.create(payload);
        toast.success('Agent 创建成功');
      }
      setDialogOpen(false);
      setEditingAgent(null);
      await loadAgents();
    } catch {
      toast.error(editingAgent ? 'Agent 更新失败' : 'Agent 创建失败');
    }
  };

  const openIssueTokenDialog = (token: string, action: 'issue' | 'rotate') => {
    setOneTimeToken(token);
    setTokenAction(action);
    setTokenDialogOpen(true);
  };

  const handleIssueCredential = async (agent: AgentAccount) => {
    try {
      const response = await agentService.issueCredential(agent.id, `${agent.slug}-credential`, 90);
      toast.success('Agent 凭证签发成功');
      openIssueTokenDialog(response.data?.token || '', 'issue');
      await loadAgents();
    } catch {
      toast.error('签发凭证失败');
    }
  };

  const handleRotateCredential = async (credentialId: string) => {
    try {
      const response = await agentService.rotateCredential(credentialId, 90);
      toast.success('Agent 凭证轮换成功');
      openIssueTokenDialog(response.data?.token || '', 'rotate');
      await loadAgents();
    } catch {
      toast.error('轮换凭证失败');
    }
  };

  const handleRevokeCredential = async (credentialId: string) => {
    try {
      await agentService.revokeCredential(credentialId);
      toast.success('Agent 凭证已吊销');
      await loadAgents();
    } catch {
      toast.error('吊销凭证失败');
    }
  };

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={ADMIN_TABS} moduleName="系统管理" />
      <PageHeader
        title="Agent 管理"
        description="管理外部 Agent 账号、能力与凭证生命周期"
        actions={
          <Button onClick={() => {
            setEditingAgent(null);
            setDialogOpen(true);
          }}>
            <Plus className="mr-2 h-4 w-4" />
            新增 Agent
          </Button>
        }
      />

      {loading ? (
        <div className="surface-panel py-12 text-center text-sm text-muted-foreground">加载中...</div>
      ) : agents.length === 0 ? (
        <div className="surface-panel py-12 text-center text-sm text-muted-foreground">暂无 Agent 账号</div>
      ) : (
        <div className="space-y-4">
          {agents.some((agent) => {
            const activeCredentials = (agent.credentials || []).filter((credential) => credential.status === 'ACTIVE');
            return activeCredentials.length >= 2 || activeCredentials.some((credential) => getCredentialRisk(credential.expiresAt));
          }) ? (
            <Card className="border-amber-300/60 bg-amber-50/50">
              <CardHeader>
                <CardTitle className="text-base">凭证风险提醒</CardTitle>
                <CardDescription>默认凭证有效期 90 天；当活跃凭证达到上限或即将过期时，请及时轮换并回收旧 token。</CardDescription>
              </CardHeader>
            </Card>
          ) : null}
          <div className="grid gap-4">
            {agents.map((agent) => {
              const activeCredentials = (agent.credentials || []).filter((credential) => credential.status === 'ACTIVE');
              return (
            <Card key={agent.id}>
              <CardHeader className="gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      <Bot className="h-5 w-5 text-primary" />
                      {agent.name}
                    </CardTitle>
                    <CardDescription className="font-mono">{agent.slug}</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{agent.defaultMode}</Badge>
                    <Badge variant={agent.status === 'ACTIVE' ? 'default' : 'secondary'}>{agent.status}</Badge>
                  </div>
                </div>
                {agent.description ? (
                  <p className="text-sm text-muted-foreground">{agent.description}</p>
                ) : null}
                {activeCredentials.length >= 2 ? (
                  <div className="rounded-lg border border-amber-300/70 bg-amber-100/50 px-3 py-2 text-sm text-amber-900">
                    活跃凭证已达到上限（{activeCredentials.length}/2），签发新凭证前请先轮换或吊销旧凭证。
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => {
                    setEditingAgent(agent);
                    setDialogOpen(true);
                  }}>
                    编辑
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleIssueCredential(agent)}>
                    <KeyRound className="mr-2 h-4 w-4" />
                    签发凭证
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
                <div className="space-y-2">
                  <p className="text-sm font-medium">能力</p>
                  <div className="flex flex-wrap gap-2">
                    {(agent.grants || []).map((grant, index) => (
                      <Badge key={`${grant.resource}.${grant.action}.${index}`} variant="secondary" className="font-mono">
                        {grant.resource}.{grant.action}
                      </Badge>
                    ))}
                    {!agent.grants?.length ? (
                      <span className="text-sm text-muted-foreground">未配置 grant</span>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">凭证</p>
                  <div className="space-y-2">
                    {(agent.credentials || []).map((credential) => (
                      <div key={credential.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="space-y-1">
                            <p className="font-medium">{credential.label || credential.credentialKey}</p>
                            <p className="text-xs text-muted-foreground">
                              {credential.secretPreview || '仅服务端保存 hash'}
                              {' · '}
                              {format(new Date(credential.createdAt), 'yyyy-MM-dd HH:mm')}
                              {credential.expiresAt ? ` · 到期 ${format(new Date(credential.expiresAt), 'yyyy-MM-dd')}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={credential.status === 'ACTIVE' ? 'default' : 'secondary'}>
                              {credential.status}
                            </Badge>
                            {getCredentialRisk(credential.expiresAt) === 'expiring' ? (
                              <Badge variant="outline" className="border-amber-400 text-amber-700">即将过期</Badge>
                            ) : null}
                            {getCredentialRisk(credential.expiresAt) === 'expired' ? (
                              <Badge variant="destructive">已过期</Badge>
                            ) : null}
                            {credential.status === 'ACTIVE' ? (
                              <>
                                <Button variant="outline" size="sm" onClick={() => handleRotateCredential(credential.id)}>
                                  <RefreshCw className="mr-2 h-4 w-4" />
                                  轮换
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handleRevokeCredential(credential.id)}>
                                  <ShieldX className="mr-2 h-4 w-4 text-destructive" />
                                  吊销
                                </Button>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">已吊销</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {!agent.credentials?.length ? (
                      <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                        尚未签发 credential
                      </div>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
              );
            })}
          </div>
        </div>
      )}

      <AgentAccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        agent={editingAgent}
        onSubmit={handleCreateOrUpdate}
      />

      <Dialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              一次性 Token
            </DialogTitle>
            <DialogDescription>
              {tokenAction === 'issue' ? '新签发的 token' : '轮换后的新 token'} 只展示这一遍，请立即保存到安全位置。
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/40 p-4 font-mono text-sm break-all">
            {oneTimeToken}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
