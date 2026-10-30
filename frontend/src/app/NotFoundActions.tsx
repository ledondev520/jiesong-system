"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAuthToken } from "@/lib/auth-token";

/**
 * Input: 当前标签的登录令牌（仅本标签 Bearer；HttpOnly 记住登录的会话在此不可见）
 * Output: 已登录时主按钮为返回工作台，否则主按钮为返回登录页（登录页会恢复已有会话）
 * Pos: 404 页面操作区
 */
export function NotFoundActions() {
  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => {
    setLoggedIn(Boolean(getAuthToken()));
  }, []);

  const dashboard = (
    <Button asChild variant={loggedIn ? "default" : "outline"} className="rounded-xl">
      <Link href="/dashboard">
        <Home className="mr-2 h-4 w-4" />
        返回工作台
      </Link>
    </Button>
  );
  const login = (
    <Button asChild variant={loggedIn ? "outline" : "default"} className="rounded-xl">
      <Link href="/login">
        <ArrowLeft className="mr-2 h-4 w-4" />
        返回登录页
      </Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      {loggedIn ? dashboard : login}
      {loggedIn ? login : dashboard}
    </div>
  );
}
