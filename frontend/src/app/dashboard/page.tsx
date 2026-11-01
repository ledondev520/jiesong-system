/**
 * Input: 当前用户、后端按角色裁剪的首页待办（GET /dashboard/todos）
 * Output: 首页：各角色的待办列表与（BOSS）应收/应付/本月毛利
 * Pos: 工作台首页；一次批量只读请求，前端不判断角色、不重算口径
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { BusinessWrite } from "@/lib/hooks/useBusinessReadOnly";
import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Ship, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { TodoBoard } from "@/components/dashboard/TodoBoard";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/data-state";
import {
  dashboardTodosService,
  type DashboardTodos,
} from "@/services/dashboardTodos.service";
import { useAuthStore } from "@/store/auth.store";

function DashboardContent() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [todos, setTodos] = useState<DashboardTodos | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await dashboardTodosService.get();
        if (!active) return;
        setTodos(response.data ?? null);
        setFailed(!response.data);
      } catch {
        if (active) setFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [reload]);

  const retry = () => {
    setLoading(true);
    setFailed(false);
    setReload((value) => value + 1);
  };

  if (!user) return null;

  return (
    <div className="space-y-5 pb-4 md:space-y-8 md:pb-16">
      <PageHeader
        title="工作台"
        description="按你的角色列出需要处理的事项。"
        showBack={false}
        actions={
          <div className="flex flex-wrap gap-2">
            <BusinessWrite>
              <Button
                className="justify-start rounded-md"
                onClick={() => router.push("/dashboard/purchases/new")}
              >
                <ShoppingCart className="mr-2 h-4 w-4" />
                新建采购合同
              </Button>
            </BusinessWrite>
            <BusinessWrite>
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push("/dashboard/sales/create")}
              >
                <Ship className="mr-2 h-4 w-4" />
                新建出口合同
              </Button>
            </BusinessWrite>
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push("/dashboard/customs?view=customs")}
            >
              <FileText className="mr-2 h-4 w-4" />
              查看报关单
            </Button>
          </div>
        }
      />

      {failed ? (
        <ErrorState
          title="待办加载失败"
          action={<Button onClick={retry}>重试</Button>}
        />
      ) : loading || !todos ? (
        <p className="text-sm text-muted-foreground" role="status">
          加载中...
        </p>
      ) : (
        <TodoBoard todos={todos} />
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  );
}
