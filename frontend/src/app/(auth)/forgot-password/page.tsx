/**
 * Input: 找回密码API
 * Output: 找回密码页面
 * Pos: 认证模块，处理用户忘记密码后的密码重置
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import api from '@/lib/axios';
import type { ApiResponse } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { CheckCircle, ArrowLeft, KeyRound } from 'lucide-react';

// 找回密码表单验证Schema
const forgotPasswordSchema = z.object({
  username: z.string().min(1, '请输入用户名'),
  phone: z
    .string()
    .regex(/^1[3-9]\d{9}$/, '请输入有效的手机号码'),
  newPassword: z
    .string()
    .min(6, '新密码至少6个字符')
    .max(32, '密码最多32个字符'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: '两次输入的密码不一致',
  path: ['confirmPassword'],
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [resetUsername, setResetUsername] = useState('');

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      username: '',
      phone: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  /**
   * 职责：提交找回密码表单
   * 思路：
   * 1. 调用后端验证用户名+手机号
   * 2. 验证通过后重置密码
   * 3. 显示成功页面
   */
  async function onSubmit(data: ForgotPasswordFormValues) {
    setIsLoading(true);

    try {
      const result: ApiResponse<null> = await api.post('/auth/reset-password', {
        username: data.username,
        phone: data.phone,
        newPassword: data.newPassword,
      });
      
      if (result.code === 200) {
        setResetUsername(data.username);
        setIsSuccess(true);
        toast.success('密码重置成功！');
      } else {
        throw new Error(result.message || '密码重置失败');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '密码重置失败，请检查信息是否正确';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }

  // 重置成功后的展示
  if (isSuccess) {
    return (
      <div className="auth-shell">
        <Card className="auth-card">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-chart-3/30 bg-chart-3/16">
              <CheckCircle className="h-10 w-10 text-chart-3" />
            </div>
            <CardTitle className="text-brand-emphasis">密码重置成功！</CardTitle>
            <CardDescription>
              您的密码已成功重置，请使用新密码登录。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted p-4 text-sm">
              <p className="text-muted-foreground">
                账号：<span className="font-mono text-foreground">{resetUsername}</span>
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button className="h-10 w-full rounded-xl" onClick={() => router.push('/login')}>
              返回登录
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <Card className="auth-card">
        <CardHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-brand-emphasis text-center">找回密码</CardTitle>
          <CardDescription className="text-center">
            请输入您的用户名和注册时绑定的手机号进行验证
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* 用户名 */}
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>用户名</FormLabel>
                    <FormControl>
                      <Input placeholder="请输入您的用户名" className="rounded-xl bg-background/70" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 手机号验证 */}
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>绑定手机号</FormLabel>
                    <FormControl>
                      <Input placeholder="请输入注册时绑定的手机号" type="tel" className="rounded-xl bg-background/70" {...field} />
                    </FormControl>
                    <FormDescription>
                      输入注册时填写的手机号以验证身份
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 新密码 */}
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>新密码</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="请设置新密码（至少6位）" className="rounded-xl bg-background/70" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 确认新密码 */}
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>确认新密码</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="请再次输入新密码" className="rounded-xl bg-background/70" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="h-10 w-full rounded-xl" disabled={isLoading}>
                {isLoading ? '验证中...' : '重置密码'}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Link 
            href="/login" 
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            返回登录
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
