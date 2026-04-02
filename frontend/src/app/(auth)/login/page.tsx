/**
 * Input: 登录API、认证状态存储
 * Output: 登录页面
 * Pos: 认证模块入口，负责用户登录与快捷登录入口
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 * Security: 快捷登录会在当前浏览器保存最近一次成功登录账号信息，仅用于已登录账号的下次一键登录
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuthStore } from '@/store/auth.store';
import type { ApiResponse } from '@/types';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { UserPlus, KeyRound, Eye, EyeOff, Ship } from 'lucide-react';
import { authService, type LoginResponse } from '@/services/auth.service';

const loginSchema = z.object({
  username: z.string().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type QuickLoginProfile = { username: string; password: string };

const QUICK_LOGIN_PROFILE_KEY = 'jiesong_quick_login_profile';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useAuthStore((state) => state.login);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [quickLoginProfile, setQuickLoginProfile] = useState<QuickLoginProfile | null>(null);

  // 检查会话过期参数
  useEffect(() => {
    const expired = searchParams.get('expired');
    if (expired === '1') {
      setError('登录会话已过期，请重新登录');
    }
  }, [searchParams]);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

  // 恢复快捷登录入口（当前浏览器维度）
  useEffect(() => {
    const savedRaw = localStorage.getItem(QUICK_LOGIN_PROFILE_KEY);
    if (!savedRaw) {
      return;
    }

    try {
      const parsed: QuickLoginProfile = JSON.parse(savedRaw);
      if (parsed.username && parsed.password) {
        setQuickLoginProfile(parsed);
      } else {
        localStorage.removeItem(QUICK_LOGIN_PROFILE_KEY);
      }
    } catch {
      localStorage.removeItem(QUICK_LOGIN_PROFILE_KEY);
    }
  }, []);

  const persistQuickLoginProfile = useCallback((username: string, password: string) => {
    const profile: QuickLoginProfile = { username, password };
    localStorage.setItem(QUICK_LOGIN_PROFILE_KEY, JSON.stringify(profile));
    setQuickLoginProfile(profile);
  }, []);

  /**
   * 职责：执行登录请求并完成状态跳转
   * @param {string} username - 用户名
   * @param {string} password - 密码
   * @returns {Promise<void>} 登录流程执行结果
   */
  const performLogin = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const result: ApiResponse<LoginResponse> = await authService.login({
        username,
        password,
      });

      if (result.code === 200 && result.data) {
        persistQuickLoginProfile(username, password);
        login(result.data.user, result.data.token);
        router.push('/dashboard');
      } else {
        throw new Error(result.message || '登录失败');
      }
    } catch (err: unknown) {
      const retryAfter =
        typeof err === 'object' && err !== null && 'retryAfter' in err
          ? Number((err as { retryAfter?: unknown }).retryAfter)
          : null;
      const rawMessage =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : '';

      if (
        /ECONNREFUSED|Failed to proxy|Network Error|fetch failed|timeout/i.test(rawMessage)
      ) {
        setError('后端服务未连接，请先启动 backend 服务（默认端口 3000）');
      } else if (retryAfter && Number.isFinite(retryAfter) && retryAfter > 0) {
        const minutes = Math.ceil(retryAfter / 60);
        setError(`登录尝试过于频繁，请 ${minutes} 分钟后再试，或切换账号后重试。`);
      } else if (rawMessage) {
        setError(rawMessage);
      } else {
        setError('登录失败，请检查用户名和密码');
      }
    } finally {
      setIsLoading(false);
    }
  }, [login, persistQuickLoginProfile, router]);

  /**
   * 职责：提交登录表单并处理登录结果
   * @param {LoginFormValues} data - 登录表单数据
   * @returns {Promise<void>} 登录流程执行结果
   */
  async function onSubmit(data: LoginFormValues) {
    await performLogin(data.username.trim(), data.password);
  }

  const handleQuickLogin = useCallback(() => {
    if (!quickLoginProfile || isLoading) {
      return;
    }

    form.setValue('username', quickLoginProfile.username, { shouldDirty: true, shouldValidate: true });
    form.setValue('password', quickLoginProfile.password, { shouldDirty: true, shouldValidate: true });
    setError(null);
    void performLogin(quickLoginProfile.username, quickLoginProfile.password);
  }, [form, isLoading, performLogin, quickLoginProfile]);

  return (
    <div className="auth-shell">
      <div className="flex w-full max-w-md flex-col items-center">
        {/* 品牌标识 */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
            <Ship className="h-6 w-6" />
          </span>
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight">捷淞系统</h1>
          </div>
        </div>
        <Card className="auth-card w-full">
        <CardHeader>
          <CardTitle>系统登录</CardTitle>
          <CardDescription>
            {quickLoginProfile ? '你已开启快捷登录，可一键进入系统。' : '首次登录成功后，下次可使用快捷登录。'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>用户名</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="请输入用户名"
                        className="rounded-xl bg-background/70"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>密码</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          aria-label="密码"
                          placeholder="••••••"
                          className="rounded-xl bg-background/70 pr-10"
                          {...field}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={showPassword ? '隐藏密码' : '显示密码'}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {error && (
                <div className="space-y-2 rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <p>{error}</p>
                </div>
              )}

              {quickLoginProfile && (
                <div className="space-y-2 rounded-xl border border-accent/40 bg-accent/10 p-3">
                  <p className="text-sm font-medium text-foreground">快捷登录</p>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full rounded-xl border-accent/50 bg-accent/10 text-accent-foreground"
                    onClick={handleQuickLogin}
                    disabled={isLoading}
                  >
                    一键登录（{quickLoginProfile.username}）
                  </Button>
                </div>
              )}

              <Button type="submit" className="h-10 w-full rounded-xl" disabled={isLoading}>
                {isLoading ? '登录中...' : '登录'}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <div className="flex w-full gap-2">
            <Link href="/register" className="flex-1">
              <Button variant="outline" className="w-full gap-2 rounded-xl border-border/70 bg-background/60">
                <UserPlus className="h-4 w-4" />
                立即注册
              </Button>
            </Link>
            <Link href="/forgot-password" className="flex-1">
              <Button variant="outline" className="w-full gap-2 rounded-xl border-border/70 bg-background/60">
                <KeyRound className="h-4 w-4" />
                忘记密码
              </Button>
            </Link>
          </div>
        </CardFooter>
        </Card>
      </div>
    </div>
  );
}
