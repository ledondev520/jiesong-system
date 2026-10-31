/**
 * Input: 系统通知 API
 * Output: 通知中心页面（查看通知、标记已读）
 * Pos: 运维中心
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { notificationLink } from "@/lib/notification-link";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { useTableSort } from "@/lib/hooks/useTableSort";
import { CheckCircle2, Search, X } from "lucide-react";
import { PageSizeSelect } from "@/components/ui/page-size-select";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  getSystemNotifications,
  markSystemNotificationRead,
  SystemNotificationItem,
} from "@/services/system.service";
import { toast } from "sonner";
import { runAwait } from "@/lib/run-await";
import { formatDateTime } from "@/lib/date-format";
import { MobileListCard } from "@/components/mobile";

type NotificationFilter = "all" | "unread";

const typeLabelMap: Record<string, string> = {
  SYSTEM: "系统",
  IMPORT: "导入",
  CONTRACT: "合同",
  PAYMENT: "财务",
  AGENT_CREDENTIAL: "Agent 凭证",
};

const getTypeLabel = (type: string) => typeLabelMap[type] || type || "-";

export default function SystemNotificationsPage() {
  const requestId = useRef(0);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<SystemNotificationItem[]>(
    [],
  );
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState("");

  // 本次渲染已按新筛选/分页重置 loading/error、但对应 effect 尚未发出请求时为 true：
  // 原先请求号在 effect 内才递增，窗口内落地的上一请求仍是"当前"请求，其数据与提示照常写入，
  // 而 loading/error 会被随后 effect 内的同步重置覆盖，因此窗口内只跳过这两项写入。
  const resetPendingRef = useRef(false);

  const requestNotifications = useCallback(() => {
    const currentRequest = ++requestId.current;
    return runAwait(
      () =>
        getSystemNotifications({
          page: currentPage,
          pageSize,
          keyword: keyword.trim() || undefined,
          unreadOnly: filter === "unread",
        }),
      (response) => {
        if (currentRequest !== requestId.current) return;
        const items = response.data?.items || [];
        setNotifications(Array.isArray(items) ? items : []);
        setTotal(response.data?.pagination?.total || 0);
        setUnreadCount(response.data?.unreadCount || 0);
      },
      () => {
        if (currentRequest !== requestId.current) return;
        if (!resetPendingRef.current) setError(true);
        toast.error("加载通知失败");
      },
      () => {
        if (currentRequest === requestId.current && !resetPendingRef.current)
          setLoading(false);
      },
    );
  }, [filter, currentPage, pageSize, keyword]);

  // 刷新按钮、标记已读后调用：与原先相同，先置 loading/清 error 再请求。
  const loadNotifications = useCallback(() => {
    setLoading(true);
    setError(false);
    return requestNotifications();
  }, [requestNotifications]);

  // 原先加载 effect 内的 setLoading(true)/setError(false) 改为筛选/分页变化时在渲染期执行；
  // 挂载时初值即为 true/false，与原先挂载 effect 的写入相同。
  const loadKey = [filter, currentPage, pageSize, keyword] as const;
  const [prevLoadKey, setPrevLoadKey] = useState(loadKey);
  if (loadKey.some((value, index) => !Object.is(value, prevLoadKey[index]))) {
    setPrevLoadKey(loadKey);
    setLoading(true);
    setError(false);
  }

  useLayoutEffect(() => {
    resetPendingRef.current = true;
  }, [requestNotifications]);

  useEffect(() => {
    resetPendingRef.current = false;
    void requestNotifications();
  }, [requestNotifications]);

  const sort = useTableSort<SystemNotificationItem, string>(
    notifications,
    useCallback((item, key) => {
      switch (key) {
        case "createdAt":
          return item.createdAt ? new Date(item.createdAt).getTime() : null;
        case "type":
          return getTypeLabel(item.type);
        case "title":
          return item.title ?? "";
        default:
          return null;
      }
    }, []),
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pagedNotifications = sort.sortedData;

  const handleMarkRead = async (id: string) => {
    setMarkingId(id);
    try {
      await markSystemNotificationRead(id);
      await loadNotifications();
      toast.success("已标记为已读");
    } catch {
      toast.error("标记失败");
    } finally {
      setMarkingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="通知中心"
        description="查看系统通知并管理已读状态"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setFilter("all");
                setCurrentPage(1);
              }}
            >
              全部通知
            </Button>
            <Button
              variant={filter === "unread" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setFilter("unread");
                setCurrentPage(1);
              }}
            >
              仅未读
            </Button>
            <Button variant="outline" size="sm" onClick={loadNotifications}>
              刷新
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>通知列表</CardTitle>
          <CardDescription>
            服务端搜索全部历史通知；排序仅作用于当前页。共 {total} 条通知，未读{" "}
            {unreadCount} 条
          </CardDescription>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-9"
                placeholder="搜索标题、内容、类型..."
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
        </CardHeader>
        <CardContent>
          {error && (
            <div
              role="alert"
              className="mb-4 rounded-md border border-destructive/30 p-3 text-sm text-destructive"
            >
              通知读取失败，保留已加载结果。
              <Button variant="outline" size="sm" onClick={loadNotifications}>
                重试
              </Button>
            </div>
          )}
          <div className="md:hidden space-y-3">
            {loading ? (
              <div className="surface-panel py-12 text-center text-sm text-muted-foreground">
                加载中...
              </div>
            ) : sort.sortedData.length === 0 ? (
              <div className="surface-panel py-12 text-center text-sm text-muted-foreground">
                暂无通知。
              </div>
            ) : (
              pagedNotifications.map((item) => {
                const contentPreview = item.content ? item.content : "-";
                return (
                  <MobileListCard
                    key={item.id}
                    title={item.title || "（无标题）"}
                    subtitle={contentPreview}
                    badge={
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {getTypeLabel(item.type)}
                        </Badge>
                        <Badge variant={item.isRead ? "secondary" : "default"}>
                          {item.isRead ? "已读" : "未读"}
                        </Badge>
                      </div>
                    }
                    fields={[
                      { label: "时间", value: formatDateTime(item.createdAt) },
                      ...(notificationLink(item)
                        ? [
                            {
                              label: "业务明细",
                              value: (
                                <Link
                                  className="text-primary underline"
                                  href={notificationLink(item)!}
                                >
                                  打开业务明细
                                </Link>
                              ),
                            },
                          ]
                        : []),
                    ]}
                    action={
                      !item.isRead ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          disabled={markingId === item.id}
                          onClick={() => handleMarkRead(item.id)}
                        >
                          <CheckCircle2 className="mr-1 h-4 w-4" />
                          {markingId === item.id ? "处理中..." : "标记已读"}
                        </Button>
                      ) : undefined
                    }
                  />
                );
              })
            )}
          </div>
          <div className="hidden md:block surface-panel overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    sortKey="createdAt"
                    currentSortKey={sort.sortKey}
                    currentSortDir={sort.sortDir}
                    onSort={sort.onSort}
                  >
                    时间
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="type"
                    currentSortKey={sort.sortKey}
                    currentSortDir={sort.sortDir}
                    onSort={sort.onSort}
                  >
                    类型
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="title"
                    currentSortKey={sort.sortKey}
                    currentSortDir={sort.sortDir}
                    onSort={sort.onSort}
                  >
                    标题
                  </SortableTableHead>
                  <TableHead>内容</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="w-[140px]">操作</TableHead>
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
                ) : sort.sortedData.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-12 text-center text-muted-foreground"
                    >
                      暂无通知。
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedNotifications.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{formatDateTime(item.createdAt)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {getTypeLabel(item.type)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {notificationLink(item) ? (
                          <Link
                            className="text-primary underline"
                            href={notificationLink(item)!}
                          >
                            {item.title || "打开业务明细"}
                          </Link>
                        ) : (
                          item.title || "-"
                        )}
                      </TableCell>
                      <TableCell className="max-w-[420px] whitespace-pre-wrap break-words text-sm text-muted-foreground">
                        {item.content || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.isRead ? "secondary" : "default"}>
                          {item.isRead ? "已读" : "未读"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {!item.isRead ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={markingId === item.id}
                            onClick={() => handleMarkRead(item.id)}
                          >
                            <CheckCircle2 className="mr-1 h-4 w-4" />
                            {markingId === item.id ? "处理中..." : "标记已读"}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            -
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {/* 分页控制 */}
          <div className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              共 {total} 条
              {totalPages > 1 ? `，第 ${currentPage}/${totalPages} 页` : ""}
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
                disabled={currentPage === totalPages || totalPages <= 1}
              >
                下一页
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
