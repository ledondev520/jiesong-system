/**
 * Input: 注册API
 * Output: 用户注册页面
 * Pos: 认证模块，处理新用户注册
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
import { CheckCircle, ArrowLeft } from 'lucide-react';

// 注册表单验证Schema
const registerSchema = z.object({
  // 姓名拼音作为用户名
  username: z
    .string()
    .min(2, '用户名至少2个字符')
    .max(20, '用户名最多20个字符')
    .regex(/^[a-zA-Z][a-zA-Z0-9]*$/, '用户名必须以字母开头，只能包含字母和数字'),
  // 真实姓名
  name: z.string().min(2, '请输入您的真实姓名'),
  // 手机号作为密保
  phone: z
    .string()
    .regex(/^1[3-9]\d{9}$/, '请输入有效的手机号码'),
  // 密码
  password: z
    .string()
    .min(6, '密码至少6个字符')
    .max(32, '密码最多32个字符'),
  // 确认密码
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: '两次输入的密码不一致',
  path: ['confirmPassword'],
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: '',
      name: '',
      phone: '',
      password: '',
      confirmPassword: '',
    },
  });

  /**
   * 职责：提交注册表单
   * 思路：调用后端注册接口，成功后显示成功页面
   */
  async function onSubmit(data: RegisterFormValues) {
    setIsLoading(true);

    try {
      const result: ApiResponse<null> = await api.post('/auth/public-register', {
        username: data.username,
        name: data.name,
        phone: data.phone,
        password: data.password,
      });
      
      if (result.code === 201 || result.code === 200) {
        setIsSuccess(true);
        toast.success('注册成功！请等待管理员审核后登录');
      } else {
        throw new Error(result.message || '注册失败');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '注册失败，请稍后重试';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }

  // 注册成功后的展示
  if (isSuccess) {
    return (
      <div className="auth-shell">
        <Card className="auth-card">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-chart-3/30 bg-chart-3/16">
              <CheckCircle className="h-10 w-10 text-chart-3" />
            </div>
            <CardTitle className="text-brand-emphasis">注册成功！</CardTitle>
            <CardDescription>
              您的账号已创建成功，请等待管理员审核后即可登录使用。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted p-4 text-sm">
              <p className="font-medium">您的账号信息：</p>
              <p className="mt-2 text-muted-foreground">
                用户名：<span className="font-mono text-foreground">{form.getValues('username')}</span>
              </p>
              <p className="text-muted-foreground">
                绑定手机：<span className="font-mono text-foreground">{form.getValues('phone')}</span>
              </p>
            </div>
            <p className="text-center text-sm text-muted-foreground">
              如有疑问，请联系管理员
            </p>
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
          <CardTitle className="text-brand-emphasis">账号注册</CardTitle>
          <CardDescription>
            创建新账号以使用捷淞进销存系统
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* 用户名（姓名拼音） */}
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>用户名 (姓名拼音)</FormLabel>
                    <FormControl>
                      <Input placeholder="zhangsan" className="rounded-xl bg-background/70" {...field} />
                    </FormControl>
                    <FormDescription>
                      请使用您的姓名拼音作为用户名，如：zhangsan
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 真实姓名 */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>真实姓名</FormLabel>
                    <FormControl>
                      <Input placeholder="张三" className="rounded-xl bg-background/70" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 手机号（密保） */}
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>手机号码 (密保)</FormLabel>
                    <FormControl>
                      <Input placeholder="13800138000" type="tel" className="rounded-xl bg-background/70" {...field} />
                    </FormControl>
                    <FormDescription>
                      用于账号安全验证和找回密码
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 密码 */}
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>设置密码</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="至少6位字符" className="rounded-xl bg-background/70" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 确认密码 */}
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>确认密码</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="再次输入密码" className="rounded-xl bg-background/70" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="h-10 w-full rounded-xl" disabled={isLoading}>
                {isLoading ? '注册中...' : '立即注册'}
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
            已有账号？返回登录
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
