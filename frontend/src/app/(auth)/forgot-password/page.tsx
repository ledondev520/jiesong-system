/** Input: bound-email OTP API; Output: password recovery and explicit legacy-account support. */
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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
import { toast } from "sonner";
import { authService } from "@/services/auth.service";
import { useAuthStore } from "@/store/auth.store";
import { isValidPassword, PASSWORD_MESSAGE } from "@/lib/password-policy";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const busy = sending || submitting;

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
    setCode("");
    try {
      await authService.sendResetPasswordCode(email.trim().toLowerCase());
      setSeconds(60);
      setNotice(
        "如果该邮箱绑定了可用账号，将收到验证码，10分钟内有效。未收到可查看垃圾邮件或联系管理员。",
      );
    } catch (err) {
      setError(
        err && typeof err === "object" && "message" in err
          ? String(err.message)
          : "发送失败，请稍后重试",
      );
    } finally {
      setSending(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!isValidPassword(newPassword)) {
      setError(PASSWORD_MESSAGE);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }
    setSubmitting(true);
    try {
      await authService.resetPassword({
        email: email.trim().toLowerCase(),
        code,
        newPassword,
      });
      setNewPassword("");
      setConfirmPassword("");
      setCode("");
      useAuthStore.getState().logout();
      setDone(true);
      toast.success("密码重置成功！");
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String(err.message)
          : "密码重置失败，请重新获取验证码";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <Card className="auth-card">
        <CardHeader>
          <CardTitle>{done ? "密码重置成功！" : "找回密码"}</CardTitle>
          <CardDescription>
            {done
              ? "已有登录会话已失效，请使用新密码重新登录。"
              : "使用账号已绑定的邮箱接收验证码，验证邮箱后重置密码。"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <Button className="w-full" onClick={() => router.push("/login")}>
              返回登录
            </Button>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="recovery-email">绑定邮箱</Label>
                <Input
                  ref={emailInput}
                  id="recovery-email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  disabled={busy}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setCode("");
                    setNotice("");
                  }}
                  placeholder="请输入账号已绑定的邮箱"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recovery-code">邮箱验证码</Label>
                <div className="flex gap-2">
                  <Input
                    id="recovery-code"
                    className="min-w-0"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    pattern="[0-9]{6}"
                    maxLength={6}
                    disabled={busy}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="6位验证码"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    disabled={busy || seconds > 0}
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
                <Label htmlFor="recovery-password">新密码</Label>
                <Input
                  id="recovery-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={72}
                  disabled={busy}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="至少8个字符"
                />
                <p className="text-xs text-muted-foreground">
                  {PASSWORD_MESSAGE}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="recovery-confirm">确认新密码</Label>
                <Input
                  id="recovery-confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  disabled={busy}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
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
              <p className="text-sm text-muted-foreground">
                旧账号未绑定邮箱、邮箱无法使用或账号尚未开通/已停用，请联系管理员核实身份。手机号和用户名不能用于直接重置密码。
              </p>
              <Button type="submit" className="w-full" disabled={busy}>
                {submitting ? "验证中…" : "重置密码"}
              </Button>
            </form>
          )}
        </CardContent>
        {!done && (
          <CardFooter>
            <Button asChild variant="ghost" className="w-full">
              <Link href="/login">返回登录</Link>
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
