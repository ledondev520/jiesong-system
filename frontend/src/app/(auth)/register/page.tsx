/** Input: email registration API; Output: verified account pending administrator approval. */
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RegistrationReceiptPanel } from "@/components/auth/RegistrationReceiptPanel";
import {
  clearRegistrationReceipt,
  saveRegistrationReceipt,
  useRegistrationReceipt,
} from "@/lib/registration-receipt";
import { authService } from "@/services/auth.service";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const receipt = useRegistrationReceipt();
  const done = Boolean(receipt);
  const emailInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!seconds) return;
    const timer = setTimeout(() => setSeconds(seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);
  const sendCode = async () => {
    if (!emailInput.current?.reportValidity()) return;
    setSending(true);
    setError("");
    setNotice("");
    try {
      await authService.sendEmailCode(email.trim().toLowerCase());
      setSeconds(60);
      setNotice("验证码已发送，10分钟内有效；未收到可查看垃圾邮件。");
    } catch (error) {
      setError(
        error && typeof error === "object" && "message" in error
          ? String(error.message)
          : "发送失败，请稍后重试",
      );
    } finally {
      setSending(false);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await authService.registerEmail({
        email: email.trim().toLowerCase(),
        name: name.trim(),
        password,
        code,
      });
      setPassword("");
      setCode("");
      saveRegistrationReceipt(email.trim().toLowerCase());
    } catch (error) {
      setError(
        error && typeof error === "object" && "message" in error
          ? String(error.message)
          : "注册失败，请稍后重试",
      );
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="auth-shell">
      <Card className="auth-card">
        <CardHeader>
          <CardTitle>{done ? "注册申请已提交" : "邮箱注册"}</CardTitle>
          <CardDescription>
            {done
              ? "邮箱验证和账号申请已完成，请按下面步骤联系管理员开通。"
              : "先验证邮箱并设置密码，再由企业管理员核对身份和角色后开通；注册不会直接进入业务系统。"}
          </CardDescription>
        </CardHeader>
        {receipt && (
          <CardContent>
            <RegistrationReceiptPanel receipt={receipt} />
          </CardContent>
        )}
        {!done && (
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">邮箱</Label>
                <Input
                  ref={emailInput}
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={email}
                  disabled={sending || submitting}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setCode("");
                    setNotice("");
                  }}
                  placeholder="请输入邮箱地址"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">邮箱验证码</Label>
                <div className="flex gap-2">
                  <Input
                    id="code"
                    className="min-w-0"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="6位验证码"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    disabled={sending || submitting || seconds > 0}
                    onClick={sendCode}
                  >
                    {sending
                      ? "发送中…"
                      : seconds
                        ? `${seconds}秒后重发`
                        : "获取验证码"}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">姓名</Label>
                <Input
                  id="name"
                  autoComplete="name"
                  required
                  maxLength={50}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="便于管理员确认身份"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">密码</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={72}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少8位"
                />
              </div>
              {notice && (
                <p role="status" className="text-sm text-muted-foreground">
                  {notice}
                </p>
              )}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={submitting || sending}
              >
                {submitting ? "提交中…" : "注册并申请开通"}
              </Button>
            </form>
          </CardContent>
        )}
        <CardFooter className="flex-col gap-2">
          <Button
            asChild
            variant={done ? "default" : "ghost"}
            className="w-full"
          >
            <Link href="/login">返回登录</Link>
          </Button>
          {done && (
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                clearRegistrationReceipt();
                setEmail("");
                setName("");
                setError("");
                setNotice("");
              }}
            >
              注册其他邮箱
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
