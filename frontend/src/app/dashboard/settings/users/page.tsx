/**
 * Input: 用户服务 API
 * Output: 账号管理、未开通/已停用账号核对入口和完整分页目录
 * Pos: 系统设置子页面，管理员管理所有账号
 */

"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { useTableSort } from "@/lib/hooks/useTableSort";
import { format } from "date-fns";
import { User, Role } from "@/types";
import { clearApiGetCache } from "@/lib/axios";
import { loadPaginatedCatalog } from "@/services/paginatedCatalog";
import { userService } from "@/services/user.service";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SemanticBadge } from "@/components/ui/status-badge";
import {
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash,
  UserCog,
  X,
} from "lucide-react";
import { PageSizeSelect } from "@/components/ui/page-size-select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserDialog } from "./components/UserDialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store/auth.store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { runAwait } from "@/lib/run-await";
import { MobileListCard } from "@/components/mobile";

export default function UsersPage() {
  // ── 人类用户状态 ──
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState("");
  // 默认只看在用账号；停用账号用「未开通/已停用」或「全部」查看
  const [statusFilter, setStatusFilter] = useState<
    "active" | "inactive" | "all"
  >("active");
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [usersError, setUsersError] = useState(false);

  // ── 数据加载 ──
  const requestUsers = useCallback(
    () =>
      runAwait(
        () =>
          loadPaginatedCatalog((page) =>
            userService.getAll({ page, pageSize: 100 }),
          ),
        (allUsers) => {
          setUsers(allUsers);
          setCurrentPage(1);
        },
        () => {
          setUsersError(true);
          toast.error("加载用户失败");
        },
        () => {
          setLoading(false);
        },
      ),
    [],
  );

  const loadUsers = useCallback(() => {
    setLoading(true);
    setUsersError(false);
    return requestUsers();
  }, [requestUsers]);

  useEffect(() => {
    void requestUsers();
  }, [requestUsers]);

  // ── 用户操作 ──
  const getRoleBadge = (role: Role) => {
    switch (role) {
      case Role.ADMIN:
        return <SemanticBadge tone="danger">管理员</SemanticBadge>;
      case Role.SALES:
        return <SemanticBadge tone="success">销售</SemanticBadge>;
      default:
        // OD-8：停用角色（PURCHASE/FINANCE/WAREHOUSE/BOSS）无法登录，需管理员重新分配
        return <SemanticBadge tone="secondary">{role}（已停用）</SemanticBadge>;
    }
  };

  const handleCreate = () => {
    setEditingUser(null);
    setIsDialogOpen(true);
  };
  const handleEdit = (user: User) => {
    setEditingUser(user);
    setIsDialogOpen(true);
  };
  // 不能删除当前登录账号：入口不渲染，这里再兜底一次。
  const requestDelete = (user: User) => {
    if (user.id === currentUserId) return;
    setUserToDelete(user);
  };
  const handleDelete = async () => {
    const target = userToDelete;
    if (!target || deleting || target.id === currentUserId) return;
    setDeleting(true);
    try {
      await userService.delete(target.id);
      setUsers((current) => current.filter((u) => u.id !== target.id));
      setCurrentPage(1);
      setUserToDelete(null);
      toast.success("用户已停用");
    } catch {
      toast.error("删除失败");
    } finally {
      setDeleting(false);
    }
  };
  const handleSubmit = async (data: Partial<User>) => {
    try {
      if (editingUser) {
        await userService.update(editingUser.id, data);
        toast.success("用户更新成功");
      } else {
        await userService.create(data);
        toast.success("用户创建成功");
      }
      setIsDialogOpen(false);
      loadUsers();
    } catch (error) {
      toast.error(editingUser ? "更新失败" : "创建失败");
      throw error;
    }
  };

  // ── 用户筛选与分页 ──
  const filteredUsers = useMemo(() => {
    const candidates =
      statusFilter === "all"
        ? users
        : users.filter((user) =>
            statusFilter === "active" ? user.isActive : !user.isActive,
          );
    if (!keyword.trim()) return candidates;
    const q = keyword.toLowerCase().trim();
    return candidates.filter(
      (u) =>
        (u.name || "").toLowerCase().includes(q) ||
        (u.username || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q) ||
        String(u.role ?? "")
          .toLowerCase()
          .includes(q),
    );
  }, [users, keyword, statusFilter]);

  const userSort = useTableSort<User, string>(
    filteredUsers,
    useCallback((item, key) => {
      switch (key) {
        case "name":
          return item.name ?? "";
        case "username":
          return item.username ?? "";
        case "role":
          return String(item.role ?? "");
        case "lastLoginAt":
          return item.lastLoginAt ? new Date(item.lastLoginAt).getTime() : null;
        default:
          return null;
      }
    }, []),
  );

  // 头部统计与表格同源（同一份 users）；加载中显示「—」，不先闪一个 0
  const activeUsers = users.filter((u) => u.isActive);
  const stats = {
    total: users.length,
    active: activeUsers.length,
    inactive: users.length - activeUsers.length,
    admins: activeUsers.filter((u) => u.role === Role.ADMIN).length,
  };
  const statText = (n: number) => (loading || usersError ? "—" : String(n));

  const totalPages = Math.ceil(userSort.sortedData.length / pageSize);
  const pagedUsers = userSort.sortedData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="账号管理"
        description="管理系统用户"
        actions={
          <div className="flex gap-2">
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
          <Badge variant="outline" className="text-[10px]">
            {loading ? "—" : filteredUsers.length}
          </Badge>
        </div>

        <p className="text-xs text-muted-foreground" data-testid="user-stats">
          共 {statText(stats.total)} 个账号 · 在用 {statText(stats.active)} ·
          已停用 {statText(stats.inactive)} · 在用管理员{" "}
          {statText(stats.admins)}
          {!loading && !usersError && (
            <> · 当前列表显示 {filteredUsers.length} 个</>
          )}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 h-9"
              placeholder="搜索姓名、账号、邮箱、角色..."
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          {keyword && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setKeyword("");
                setCurrentPage(1);
              }}
            >
              <X className="h-4 w-4 mr-1" />
              重置
            </Button>
          )}
        </div>

        <section
          aria-label="账号开通指引"
          className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm"
        >
          <p className="font-medium">有同事注册后无法登录？在这里核对并开通</p>
          <p className="text-muted-foreground">
            筛选未开通/已停用账号 → 搜索申请人的邮箱 → 点击「核对并开通」→
            核对身份和角色 → 打开「账号开通」并保存。
          </p>
          <p className="text-muted-foreground">
            此列表也包含已停用账号，请核对停用原因；不会自动恢复或批量开通。
          </p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["active", "在用账号", stats.active],
                ["inactive", "未开通/已停用", stats.inactive],
                ["all", "全部账号", stats.total],
              ] as const
            ).map(([value, label, count]) => (
              <Button
                key={value}
                type="button"
                variant={statusFilter === value ? "default" : "outline"}
                aria-pressed={statusFilter === value}
                onClick={() => {
                  setStatusFilter(value);
                  setCurrentPage(1);
                }}
              >
                {label}
                {!loading && !usersError ? `（${count}）` : ""}
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => {
                clearApiGetCache();
                void loadUsers();
              }}
            >
              <RefreshCw className="mr-1 h-4 w-4" />
              {loading ? "刷新中…" : "刷新账号"}
            </Button>
          </div>
          {usersError && (
            <p role="alert" className="text-destructive">
              账号列表未能完整刷新，请重试；不要根据旧列表判断申请是否存在。
            </p>
          )}
        </section>

        {/* 移动端卡片列表 */}
        <div className="space-y-3 md:hidden">
          {loading ? (
            <div className="surface-panel py-10 text-center text-sm text-muted-foreground">
              加载中...
            </div>
          ) : pagedUsers.length === 0 ? (
            <div className="surface-panel py-10 text-center text-sm text-muted-foreground">
              {usersError
                ? "列表加载失败，请刷新重试"
                : statusFilter === "inactive"
                  ? "没有匹配的未开通/已停用账号"
                  : keyword
                    ? "没有匹配的用户"
                    : "暂无用户"}
            </div>
          ) : (
            pagedUsers.map((user) => (
              <MobileListCard
                key={user.id}
                title={
                  user.id === currentUserId
                    ? `${user.name}（当前账号）`
                    : user.name
                }
                subtitle={user.username}
                badge={getRoleBadge(user.role)}
                className={cn(!user.isActive && "opacity-60")}
                fields={[
                  {
                    label: "状态",
                    value: user.isActive ? "正常" : "未开通/已停用",
                    emphasis: user.isActive ? "primary" : undefined,
                  },
                  {
                    label: "最后登录",
                    value: user.lastLoginAt
                      ? format(new Date(user.lastLoginAt), "MM-dd HH:mm")
                      : "从未登录",
                  },
                ]}
                action={
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 flex-1 rounded-xl"
                      onClick={() => handleEdit(user)}
                    >
                      <Pencil className="mr-1 h-4 w-4" />{" "}
                      {user.isActive ? "编辑" : "核对并开通"}
                    </Button>
                    {user.id !== currentUserId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-10 rounded-xl px-3"
                        aria-label={`删除 ${user.username}`}
                        onClick={() => requestDelete(user)}
                      >
                        <Trash className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
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
                <TableHead className="w-[170px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-12 text-center text-muted-foreground"
                  >
                    加载中...
                  </TableCell>
                </TableRow>
              ) : pagedUsers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-12 text-center text-muted-foreground"
                  >
                    {usersError
                      ? "列表加载失败，请刷新重试"
                      : statusFilter === "inactive"
                        ? "没有匹配的未开通/已停用账号"
                        : keyword
                          ? "没有匹配的用户"
                          : "暂无用户。"}
                  </TableCell>
                </TableRow>
              ) : (
                pagedUsers.map((user) => (
                  <TableRow
                    key={user.id}
                    className={cn(!user.isActive && "bg-muted/30 opacity-60")}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8 border border-border/60">
                          {user.avatar ? (
                            <AvatarImage src={user.avatar} alt={user.name} />
                          ) : null}
                          <AvatarFallback>
                            {user.name.slice(0, 1).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        {user.name}
                        {user.id === currentUserId && (
                          <Badge variant="outline" className="text-[10px]">
                            当前账号
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{user.username}</TableCell>
                    <TableCell>{getRoleBadge(user.role)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={user.isActive ? "outline" : "secondary"}
                        className={
                          user.isActive
                            ? "border-primary/20 bg-primary/5 text-primary"
                            : ""
                        }
                      >
                        {user.isActive ? "正常" : "未开通/已停用"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.lastLoginAt
                        ? format(new Date(user.lastLoginAt), "yyyy-MM-dd HH:mm")
                        : "从未登录"}
                    </TableCell>
                    <TableCell className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(user)}
                        aria-label={`${user.isActive ? "编辑" : "核对并开通"} ${user.username}`}
                      >
                        <Pencil className="h-4 w-4" />
                        {user.isActive ? "编辑" : "核对并开通"}
                      </Button>
                      {user.id !== currentUserId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-xl border border-border/65 bg-background/55"
                          aria-label={`删除 ${user.username}`}
                          onClick={() => requestDelete(user)}
                        >
                          <Trash className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              共 {userSort.sortedData.length} 条，第 {currentPage}/{totalPages}{" "}
              页
            </span>
            <div className="flex items-center gap-2">
              <PageSizeSelect
                value={pageSize}
                onChange={(size) => {
                  setPageSize(size);
                  setCurrentPage(1);
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
              >
                下一页
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── 对话框 ── */}
      <UserDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        user={editingUser}
        isSelf={Boolean(editingUser && editingUser.id === currentUserId)}
        onSubmit={handleSubmit}
      />
      <AlertDialog
        open={userToDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setUserToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除账号</AlertDialogTitle>
            <AlertDialogDescription>
              将永久删除账号 <strong>{userToDelete?.name}</strong>（
              {userToDelete?.username}），无法撤销。
              <br />
              只是不想让对方登录？请取消，改在「编辑」里关闭「账号开通」。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
