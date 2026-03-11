/**
 * Input: 登录API、认证状态存储
 * Output: 登录页面
 * Pos: 认证模块入口，负责用户登录、用户名记忆
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 * Security: 密码从不存储在本地，仅用户名可记住
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuthStore } from '@/store/auth.store';
import type { ApiResponse } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { UserPlus, KeyRound, Eye, EyeOff } from 'lucide-react';
import { authService, type LoginResponse } from '@/services/auth.service';

const loginSchema = z.object({
  username: z.string().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
  rememberMe: z.boolean(),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const REMEMBER_USERNAME_KEY = 'jiesong_saved_username';

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedUsername, setSavedUsername] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
      rememberMe: false,
    },
  });

  // Check for saved username on mount (security: never store password)
  useEffect(() => {
    const savedRaw = localStorage.getItem(REMEMBER_USERNAME_KEY);
    if (savedRaw) {
      try {
        const parsed: RememberedUsername = JSON.parse(savedRaw);
        if (parsed.username) {
          form.setValue('username', parsed.username);
          form.setValue('rememberMe', true);
          setSavedUsername(parsed.username);
        }
      } catch {
        localStorage.removeItem(REMEMBER_USERNAME_KEY);
      }
    }
  }, [form]);

  /**
   * 职责：执行登录请求并完成状态跳转
   * 安全说明：密码仅用于本次登录，不存储在本地
   * @param {string} username - 用户名
   * @param {string} password - 密码
   * @param {boolean} rememberMe - 是否记住用户名
   * @returns {Promise<void>} 登录流程执行结果
   */
  const performLogin = async (username: string, password: string, rememberMe: boolean) => {
    setIsLoading(true);
    setError(null);

    try {
      if (rememberMe) {
        // 安全：只存储用户名，不存储密码
        localStorage.setItem(REMEMBER_USERNAME_KEY, JSON.stringify({ username }));
        setSavedUsername(username);
      } else {
        localStorage.removeItem(REMEMBER_USERNAME_KEY);
        setSavedUsername(null);
      }

      const result: ApiResponse<LoginResponse> = await authService.login({
        username,
        password,
      });
      
      if (result.code === 200 && result.data) {
        login(result.data.user, result.data.token);
        router.push('/');
      } else {
        throw new Error(result.message || '登录失败');
      }
    } catch (err: unknown) {
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
      } else if (rawMessage) {
        setError(rawMessage);
      } else {
        setError('登录失败，请检查用户名和密码');
      }
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 职责：提交登录表单并处理登录结果
   * 思路：
   * 1. 先处理记住用户名
   * 2. 调用后端登录接口并保存用户信息
   * 3. 根据错误类型返回可操作的提示信息
   * @param {LoginFormValues} data - 登录表单数据
   * @returns {Promise<void>} 登录流程执行结果
   */
  async function onSubmit(data: LoginFormValues) {
    await performLogin(data.username, data.password, data.rememberMe);
  }

  return (
    <div className="auth-shell">
      <Card className="auth-card">
        <CardHeader>
          <CardTitle className="text-brand-emphasis">系统登录</CardTitle>
          <CardDescription>
            请输入您的账号密码以访问系统。
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
                      <Input placeholder="admin" className="rounded-xl bg-background/70" {...field} />
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
                          placeholder="••••••"
                          className="rounded-xl bg-background/70 pr-10"
                          {...field}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
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
              
              <FormField
                control={form.control}
                name="rememberMe"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        记住用户名
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />

              {error && (
                <div className="space-y-2 rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <p>{error}</p>
                </div>
              )}

              {savedUsername && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full rounded-xl border-accent/50 bg-accent/10 text-accent-foreground"
                  onClick={() => {
                    form.setValue('username', savedUsername);
                  }}
                  disabled={isLoading}
                >
                  使用记住的用户名（{savedUsername}）
                </Button>
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
          <p className="text-center text-sm text-muted-foreground">请使用管理员分配的账号登录。</p>
        </CardFooter>
      </Card>
    </div>
  );
}
