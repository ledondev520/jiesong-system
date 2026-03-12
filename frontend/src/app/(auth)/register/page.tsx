/**
 * Input: 注册API
 * Output: 邀请制注册说明页
 * Pos: 认证模块，处理新用户注册
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export default function RegisterPage() {
  return (
    <div className="auth-shell">
      <Card className="auth-card">
        <CardHeader>
          <CardTitle>账号注册已关闭</CardTitle>
          <CardDescription>
            系统当前采用“管理员邀请注册”模式
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 rounded-lg border border-muted bg-muted/20 p-4 text-sm text-muted-foreground">
            <p>
              为了保障系统安全，捷淞进销存系统采用管理员邀请制注册。
            </p>
            <p>
              请联系系统管理员，由管理员在后台创建新账号后再登录。
            </p>
            <p>
              如需开通账号，请说明您的姓名、部门及联系方式。
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button asChild className="h-10 w-full rounded-xl">
            <Link href="/login">
              返回登录
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
