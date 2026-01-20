'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuthStore } from '@/store/auth.store';
import api from '@/lib/axios';
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
import { UserPlus, KeyRound } from 'lucide-react';

const loginSchema = z.object({
  username: z.string().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
  rememberMe: z.boolean(),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
      rememberMe: false,
    },
  });

  // Check for saved credentials on mount
  useEffect(() => {
    const saved = localStorage.getItem('jiesong_credentials');
    if (saved) {
      try {
        const { username, password } = JSON.parse(atob(saved));
        form.setValue('username', username);
        form.setValue('password', password);
        form.setValue('rememberMe', true);
      } catch {
        localStorage.removeItem('jiesong_credentials');
      }
    }
  }, [form]);

  /**
   * 职责：提交登录表单并处理登录结果
   * 思路：先处理记住密码，再调用后端登录接口并保存用户信息
   * @param {LoginFormValues} data - 登录表单数据
   * @returns {Promise<void>} 登录流程执行结果
   */
  async function onSubmit(data: LoginFormValues) {
    setIsLoading(true);
    setError(null);

    try {
      // Handle Remember Me
      if (data.rememberMe) {
        const credentials = btoa(JSON.stringify({ username: data.username, password: data.password }));
        localStorage.setItem('jiesong_credentials', credentials);
      } else {
        localStorage.removeItem('jiesong_credentials');
      }

      // 调用后端登录API（使用统一axios实例）
      const result = await api.post('/auth/login', {
        username: data.username,
        password: data.password,
      });
      
      if (result.code === 200 && result.data) {
        login(result.data.user, result.data.token);
        router.push('/');
      } else {
        throw new Error(result.message || '登录失败');
      }
      
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '登录失败，请检查用户名和密码';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>系统登录</CardTitle>
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
                      <Input placeholder="admin" {...field} />
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
                      <Input type="password" placeholder="••••••" {...field} />
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
                        7天免登录 (记住账号密码)
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />

              {error && (
                <div className="text-sm text-destructive">{error}</div>
              )}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? '登录中...' : '登录'}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <div className="flex w-full gap-2">
            <Link href="/register" className="flex-1">
              <Button variant="outline" className="w-full gap-2">
                <UserPlus className="h-4 w-4" />
                立即注册
              </Button>
            </Link>
            <Link href="/forgot-password" className="flex-1">
              <Button variant="outline" className="w-full gap-2">
                <KeyRound className="h-4 w-4" />
                忘记密码
              </Button>
            </Link>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            默认管理员: admin / 123456
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
