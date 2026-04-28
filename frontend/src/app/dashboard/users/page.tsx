/**
 * Input: 用户服务 API、Agent 服务 API
 * Output: 账号管理页面（人类用户 + Agent 账号统一管理）
 * Pos: 系统设置子页面，管理员管理所有账号
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { useTableSort } from '@/lib/hooks/useTableSort';
import { format } from 'date-fns';
import { User, Role } from '@/types';
import type { AgentAccount } from '@/types';
import { userService } from '@/services/user.service';
import { agentService } from '@/services/agent.service';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Bot, Copy, KeyRound, Pencil, Plus, RefreshCw, Search, ShieldCheck, ShieldX, Trash, UserCog, X } from 'lucide-react';
import { PageSizeSelect } from '@/components/ui/page-size-select';
import { ModuleTabHeader, ADMIN_TABS } from '@/components/layout/ModuleTabHeader';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserDialog } from './components/UserDialog';
import { AgentAccountDialog } from '@/components/dialog/AgentAccountDialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { MobileListCard } from '@/components/mobile';

export default function UsersPage() {
  // ── 人类用户状态 ──
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');

  // ── Agent 账号状态 ──
  const [agents, setAgents] = useState<AgentAccount[]>([]);
  const [agentLoading, setAgentLoading] = useState(true);
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentAccount | null>(null);
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [oneTimeToken, setOneTimeToken] = useState('');
  const [tokenAction, setTokenAction] = useState<'issue' | 'rotate'>('issue');
  const origin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://your-vps-host';

  const automatedInstallCommand = useMemo(() => {
    if (!oneTimeToken) return '';
    return `JIESONG_BASE_URL="${origin}" JIESONG_AGENT_TOKEN="${oneTimeToken}" curl -fsSL ${origin}/agent/install.sh | bash`;
  }, [origin, oneTimeToken]);

  // ── 数据加载 ──
  useEffect(() => {
    loadUsers();
    loadAgents();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await userService.getAll({ page: 1, pageSize: 100 });
      setUsers(response.data?.items || []);
    } catch {
      toast.error('加载用户失败');
    } finally {
      setLoading(false);
    }
  };

  const loadAgents = async () => {
    setAgentLoading(true);
    try {
      const response = await agentService.getAll({ page: 1, pageSize: 100 });
      setAgents(response.data?.items || []);
    } catch {
      toast.error('加载 Agent 列表失败');
    } finally {
      setAgentLoading(false);
    }
  };

  // ── 用户操作 ──
  const getRoleBadge = (role: Role) => {
    switch (role) {
      case Role.ADMIN: return <SemanticBadge tone="danger">管理员</SemanticBadge>;
      case Role.PURCHASE: return <SemanticBadge tone="info">采购</SemanticBadge>;
      case Role.SALES: return <SemanticBadge tone="success">销售</SemanticBadge>;
      case Role.FINANCE: return <SemanticBadge tone="warning">财务</SemanticBadge>;
      case Role.WAREHOUSE: return <SemanticBadge tone="secondary">仓库</SemanticBadge>;
      default: return <SemanticBadge tone="secondary">{role}</SemanticBadge>;
    }
  };

  const handleCreate = () => { setEditingUser(null); setIsDialogOpen(true); };
  const handleEdit = (user: User) => { setEditingUser(user); setIsDialogOpen(true); };
  const handleDelete = async (id: string) => {
    if (confirm('确定要删除此用户吗？')) {
      try {
        await userService.delete(id);
        setUsers(users.filter(u => u.id !== id));
        toast.success('用户已删除');
      } catch { toast.error('删除失败'); }
    }
  };
  const handleSubmit = async (data: Partial<User>) => {
    try {
      if (editingUser) {
        await userService.update(editingUser.id, data);
        toast.success('用户更新成功');
      } else {
        await userService.create(data);
        toast.success('用户创建成功');
      }
      setIsDialogOpen(false);
      loadUsers();
    } catch { toast.error(editingUser ? '更新失败' : '创建失败'); }
  };

  // ── Agent 操作 ──
  const copyText = async (text: string, successMessage: string) => {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    toast.success(successMessage);
  };

  const getCredentialRisk = (expiresAt?: string | null) => {
    if (!expiresAt) return null;
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
    if (diffDays < 0) return 'expired';
    if (diffDays <= 14) return 'expiring';
    return null;
  };

  const handleAgentCreateOrUpdate = async (payload: Parameters<typeof agentService.create>[0]) => {
    try {
      if (editingAgent) {
        await agentService.update(editingAgent.id, payload);
        toast.success('Agent 更新成功');
      } else {
        await agentService.create(payload);
        toast.success('Agent 创建成功');
      }
      setAgentDialogOpen(false);
      setEditingAgent(null);
      await loadAgents();
    } catch { toast.error(editingAgent ? 'Agent 更新失败' : 'Agent 创建失败'); }
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
    } catch { toast.error('签发凭证失败'); }
  };

  const handleRotateCredential = async (credentialId: string) => {
    try {
      const response = await agentService.rotateCredential(credentialId, 90);
      toast.success('Agent 凭证轮换成功');
      openIssueTokenDialog(response.data?.token || '', 'rotate');
      await loadAgents();
    } catch { toast.error('轮换凭证失败'); }
  };

  const handleRevokeCredential = async (credentialId: string) => {
    try {
      await agentService.revokeCredential(credentialId);
      toast.success('Agent 凭证已吊销');
      await loadAgents();
    } catch { toast.error('吊销凭证失败'); }
  };

  // ── 用户筛选与分页 ──
  const filteredUsers = useMemo(() => {
    if (!keyword.trim()) return users;
    const q = keyword.toLowerCase().trim();
    return users.filter((u) => (
      (u.name || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      String(u.role ?? '').toLowerCase().includes(q)
    ));
  }, [users, keyword]);

  const userSort = useTableSort<User, string>(
    filteredUsers,
    useCallback((item, key) => {
      switch (key) {
        case 'name':
          return item.name ?? '';
        case 'username':
          return item.username ?? '';
        case 'role':
          return String(item.role ?? '');
        case 'lastLoginAt':
          return item.lastLoginAt ? new Date(item.lastLoginAt).getTime() : null;
        default:
          return null;
      }
    }, [])
  );

  const totalPages = Math.ceil(userSort.sortedData.length / pageSize);
  const pagedUsers = userSort.sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={ADMIN_TABS} moduleName="系统管理" />
      <PageHeader
        title="账号管理"
        description="管理系统用户与外部 Agent 账号"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setEditingAgent(null); setAgentDialogOpen(true); }}>
              <Bot className="mr-2 h-4 w-4" />
              新增 Agent
            </Button>
            <Button onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              新增用户
            </Button>
          </div>
        }
      />

      {/* ══════════ 用户区块 ══════════ */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <UserCog className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">系统用户</h3>
          <Badge variant="outline" className="text-[10px]">{filteredUsers.length}</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 h-9"
              placeholder="搜索姓名、账号、邮箱、角色..."
              value={keyword}
              onChange={(e) => { setKeyword(e.target.value); setCurrentPage(1); }}
            />
          </div>
          {keyword && (
            <Button variant="ghost" size="sm" onClick={() => { setKeyword(''); setCurrentPage(1); }}>
              <X className="h-4 w-4 mr-1" />
              重置
            </Button>
          )}
        </div>

        {/* 移动端卡片列表 */}
        <div className="space-y-3 md:hidden">
          {loading ? (
            <div className="surface-panel py-10 text-center text-sm text-muted-foreground">加载中...</div>
          ) : pagedUsers.length === 0 ? (
            <div className="surface-panel py-10 text-center text-sm text-muted-foreground">
              {keyword ? '没有匹配的用户' : '暂无用户'}
            </div>
          ) : (
            pagedUsers.map((user) => (
              <MobileListCard
                key={user.id}
                title={user.name}
                subtitle={user.username}
                badge={getRoleBadge(user.role)}
                fields={[
                  { label: '状态', value: user.isActive ? '正常' : '禁用', emphasis: user.isActive ? 'primary' : undefined },
                  { label: '最后登录', value: user.lastLoginAt ? format(new Date(user.lastLoginAt), 'MM-dd HH:mm') : '从未登录' },
                ]}
                action={
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-10 flex-1 rounded-xl" onClick={() => handleEdit(user)}>
                      <Pencil className="mr-1 h-4 w-4" /> 编辑
                    </Button>
                    <Button variant="ghost" size="sm" className="h-10 rounded-xl px-3" onClick={() => handleDelete(user.id)}>
                      <Trash className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                }
              />
            ))
          )}
        </div>

        {/* 桌面端表格 */}
        <div className="surface-panel hidden overflow-hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead
                  sortKey="name"
                  currentSortKey={userSort.sortKey}
                  currentSortDir={userSort.sortDir}
                  onSort={userSort.onSort}
                >
                  姓名
                </SortableTableHead>
                <SortableTableHead
                  sortKey="username"
                  currentSortKey={userSort.sortKey}
                  currentSortDir={userSort.sortDir}
                  onSort={userSort.onSort}
                >
                  账号
                </SortableTableHead>
                <SortableTableHead
                  sortKey="role"
                  currentSortKey={userSort.sortKey}
                  currentSortDir={userSort.sortDir}
                  onSort={userSort.onSort}
                >
                  角色
                </SortableTableHead>
                <TableHead>状态</TableHead>
                <SortableTableHead
                  sortKey="lastLoginAt"
                  currentSortKey={userSort.sortKey}
                  currentSortDir={userSort.sortDir}
                  onSort={userSort.onSort}
                >
                  最后登录
                </SortableTableHead>
                <TableHead className="w-[100px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">加载中...</TableCell>
                </TableRow>
              ) : pagedUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">暂无用户。</TableCell>
                </TableRow>
              ) : (
                pagedUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8 border border-border/60">
                          {user.avatar ? <AvatarImage src={user.avatar} alt={user.name} /> : null}
                          <AvatarFallback>{user.name.slice(0, 1).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        {user.name}
                      </div>
                    </TableCell>
                    <TableCell>{user.username}</TableCell>
                    <TableCell>{getRoleBadge(user.role)}</TableCell>
                    <TableCell>
                      <Badge variant={user.isActive ? 'outline' : 'secondary'} className={user.isActive ? 'border-primary/20 bg-primary/5 text-primary' : ''}>
                        {user.isActive ? '正常' : '禁用'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.lastLoginAt ? format(new Date(user.lastLoginAt), 'yyyy-MM-dd HH:mm') : '从未登录'}
                    </TableCell>
                    <TableCell className="flex gap-2">
                      <Button variant="ghost" size="icon" className="rounded-xl border border-border/65 bg-background/55" onClick={() => handleEdit(user)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="rounded-xl border border-border/65 bg-background/55" onClick={() => handleDelete(user.id)}>
                        <Trash className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>共 {userSort.sortedData.length} 条，第 {currentPage}/{totalPages} 页</span>
            <div className="flex items-center gap-2">
              <PageSizeSelect value={pageSize} onChange={(size) => { setPageSize(size); setCurrentPage(1); }} />
              <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>上一页</Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>下一页</Button>
            </div>
          </div>
        )}
      </div>

      {/* ══════════ Agent 区块 ══════════ */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">外部 Agent</h3>
          <Badge variant="outline" className="text-[10px]">{agents.length}</Badge>
        </div>

        {agentLoading ? (
          <div className="surface-panel py-8 text-center text-sm text-muted-foreground">加载中...</div>
        ) : agents.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <Bot className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">暂无 Agent 账号，点击上方「新增 Agent」创建</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {agents.map((agent) => (
              <Card key={agent.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Bot className="h-4 w-4 text-primary" />
                        {agent.name}
                        <span className="font-mono text-xs text-muted-foreground">({agent.slug})</span>
                      </CardTitle>
                      {agent.description ? <CardDescription>{agent.description}</CardDescription> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={agent.status === 'ACTIVE' ? 'default' : 'secondary'}>{agent.status === 'ACTIVE' ? '已启用' : '已停用'}</Badge>
                      <Button variant="outline" size="sm" onClick={() => { setEditingAgent(agent); setAgentDialogOpen(true); }}>编辑</Button>
                      <Button variant="outline" size="sm" onClick={() => handleIssueCredential(agent)}>
                        <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                        签发凭证
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {(agent.credentials || []).length > 0 && (
                  <CardContent className="pt-0 space-y-2">
                    {(agent.credentials || []).map((credential) => (
                      <div key={credential.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                        <div className="space-y-0.5">
                          <p className="font-medium text-sm">{credential.label || credential.credentialKey}</p>
                          <p className="text-xs text-muted-foreground">
                            {credential.secretPreview || 'hash'}
                            {' · '}
                            {format(new Date(credential.createdAt), 'yyyy-MM-dd')}
                            {credential.expiresAt ? ` · 到期 ${format(new Date(credential.expiresAt), 'yyyy-MM-dd')}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={credential.status === 'ACTIVE' ? 'default' : 'secondary'} className="text-[10px]">
                            {credential.status}
                          </Badge>
                          {getCredentialRisk(credential.expiresAt) === 'expiring' && <Badge variant="outline" className="border-amber-400 text-amber-700 text-[10px]">即将过期</Badge>}
                          {getCredentialRisk(credential.expiresAt) === 'expired' && <Badge variant="destructive" className="text-[10px]">已过期</Badge>}
                          {credential.status === 'ACTIVE' && (
                            <>
                              <Button variant="outline" size="sm" onClick={() => handleRotateCredential(credential.id)}>
                                <RefreshCw className="mr-1 h-3.5 w-3.5" />轮换
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleRevokeCredential(credential.id)}>
                                <ShieldX className="mr-1 h-3.5 w-3.5 text-destructive" />吊销
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ── 对话框 ── */}
      <UserDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} user={editingUser} onSubmit={handleSubmit} />
      <AgentAccountDialog open={agentDialogOpen} onOpenChange={setAgentDialogOpen} agent={editingAgent} onSubmit={handleAgentCreateOrUpdate} />

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
          <div className="rounded-lg border bg-muted/40 p-4 font-mono text-sm break-all">{oneTimeToken}</div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">自动化安装命令</p>
              <Button variant="outline" size="sm" onClick={() => void copyText(automatedInstallCommand, '安装命令已复制')}>
                <Copy className="mr-2 h-4 w-4" />复制
              </Button>
            </div>
            <div className="rounded-lg border bg-muted/40 p-4 font-mono text-xs break-all">{automatedInstallCommand}</div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
