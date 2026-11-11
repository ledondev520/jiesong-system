/**
 * Input: 登录API、认证状态存储
 * Output: 可选固定期限保持登录、会话恢复与无缓存密码的认证表单
 * Pos: 认证模块入口，负责用户登录与旧快捷登录缓存清理
 *
 * Security: 登录页不保存或提交浏览器缓存密码；旧快捷登录缓存仅清理，不再作为登录凭据
 */

"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  useRef,
  useSyncExternalStore,
  Suspense,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuthStore } from "@/store/auth.store";
import type { ApiResponse } from "@/types";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { getAuthToken, clearAuthToken } from "@/lib/auth-token";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/components/auth/AuthShell";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Eye, EyeOff, AlertCircle, Loader2 } from "lucide-react";
import { authService, type LoginResponse } from "@/services/auth.service";
import { RegistrationReceiptPanel } from "@/components/auth/RegistrationReceiptPanel";
import {
  clearRegistrationReceipt,
  useRegistrationReceipt,
} from "@/lib/registration-receipt";
import { clearLegacyQuickLoginState } from "@/lib/legacy-auth-cleanup";

const loginSchema = z.object({
  username: z.string().min(1, "请输入用户名或邮箱"),
  password: z.string().min(1, "请输入密码"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const EXPIRED_MESSAGE = "登录会话已过期，请重新登录";
const subscribeNoop = () => () => {};

function LoginFormClient() {
  const router = useRouter();
  const registrationReceipt = useRegistrationReceipt();
  const searchParams = useSearchParams();
  const login = useAuthStore((state) => state.login);
  const [rememberMe, setRememberMe] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const submitted = useRef(false);
  const loginRequest = useRef<AbortController | null>(null);
  useEffect(() => () => loginRequest.current?.abort(), []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  // Hydration 完成前禁用提交，避免浏览器按原生 GET 表单把账号密码拼进 URL：
  // 服务端与 hydration 渲染取 false，客户端取 true（原先由挂载 effect 置 true）。
  const isClientReady = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  // 检查会话过期参数：原先在 effect 内随 searchParams 变化同步写入，改为渲染期执行（初值 null 使挂载时同样执行）。
  // 渲染期已写入、对应被动 effect 尚未执行的窗口内，原 effect 会随后用过期提示覆盖异步回调写入的错误，
  // 因此窗口内（仅 expired=1 时）异步回调跳过错误写入；事件处理不会落在该窗口（离散事件前会先执行待处理的被动 effect）。
  const [prevSearchParams, setPrevSearchParams] = useState<
    typeof searchParams | null
  >(null);
  if (prevSearchParams !== searchParams) {
    setPrevSearchParams(searchParams);
    if (searchParams.get("expired") === "1") {
      setError(EXPIRED_MESSAGE);
    }
  }
  const expiredPendingRef = useRef(false);
  useLayoutEffect(() => {
    expiredPendingRef.current = searchParams.get("expired") === "1";
  }, [searchParams]);
  useEffect(() => {
    expiredPendingRef.current = false;
  }, [searchParams]);
  const setAsyncError = useCallback((message: string) => {
    if (!expiredPendingRef.current) setError(message);
  }, []);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  // 清理旧版快捷登录缓存：旧实现保存过密码，不能再作为登录凭据复用。
  useEffect(() => {
    clearLegacyQuickLoginState();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const token = getAuthToken();
    let restored = false;
    void authService
      .restoreSession(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (
          result.code !== 200 ||
          !result.data?.user ||
          (!token && !result.data.csrfToken)
        )
          throw result;
        login(result.data.user, token, result.data.csrfToken);
        restored = true;
        router.replace("/dashboard");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const code =
          typeof err === "object" && err !== null && "code" in err
            ? Number(err.code)
            : null;
        if (code === 401) {
          clearAuthToken();
        } else {
          setAsyncError("暂时无法确认登录状态，请重试登录");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && !restored) setCheckingSession(false);
      });
    return () => controller.abort();
  }, [login, router, setAsyncError]);

  const clearLegacyQuickLoginProfile = useCallback(() => {
    clearLegacyQuickLoginState();
  }, []);

  /**
   * 职责：执行登录请求并完成状态跳转
   * @param {string} username - 用户名
   * @param {string} password - 密码
   * @returns {Promise<void>} 登录流程执行结果
   */
  const performLogin = useCallback(
    async (username: string, password: string) => {
      if (submitted.current) return;
      submitted.current = true;
      const controller = new AbortController();
      loginRequest.current = controller;
      setIsLoading(true);
      setError(null);

      try {
        const result: ApiResponse<LoginResponse> = await authService.login(
          {
            username,
            password,
            ...(rememberMe ? { rememberMe: true } : {}),
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;

        if (result.code === 200 && result.data) {
          clearLegacyQuickLoginProfile();
          clearRegistrationReceipt();
          login(result.data.user, result.data.token, result.data.csrfToken);
          router.push("/dashboard");
        } else {
          throw new Error(result.message || "登录失败");
        }
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        const retryAfter =
          typeof err === "object" && err !== null && "retryAfter" in err
            ? Number((err as { retryAfter?: unknown }).retryAfter)
            : null;
        const rawMessage =
          err instanceof Error
            ? err.message
            : typeof err === "object" && err !== null && "message" in err
              ? String((err as { message: unknown }).message)
              : "";

        if (
          /ECONNREFUSED|Failed to proxy|Network Error|fetch failed|timeout/i.test(
            rawMessage,
          )
        ) {
          setAsyncError(
            "后端服务未连接，请先启动 backend 服务（默认端口 3001）",
          );
        } else if (
          retryAfter &&
          Number.isFinite(retryAfter) &&
          retryAfter > 0
        ) {
          const minutes = Math.ceil(retryAfter / 60);
          setAsyncError(
            `登录尝试过于频繁，请 ${minutes} 分钟后再试，或切换账号后重试。`,
          );
        } else if (rawMessage) {
          setAsyncError(rawMessage);
        } else {
          setAsyncError("登录失败，请检查用户名和密码");
        }
      } finally {
        if (controller.signal.aborted) return;
        submitted.current = false;
        setIsLoading(false);
      }
    },
    [clearLegacyQuickLoginProfile, login, rememberMe, router, setAsyncError],
  );

  /**
   * 职责：提交登录表单并处理登录结果
   * @param {LoginFormValues} data - 登录表单数据
   * @returns {Promise<void>} 登录流程执行结果
   */
  async function onSubmit(data: LoginFormValues) {
    await performLogin(data.username.trim(), data.password);
  }

  return (
    <AuthShell brandHeading>
      <Card className="auth-card w-full">
        <CardHeader className="space-y-2 pb-5">
          <CardTitle className="text-lg font-semibold">系统登录</CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            请输入账号密码登录捷淞进销存系统。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pb-5">
          {registrationReceipt && (
            <RegistrationReceiptPanel receipt={registrationReceipt} />
          )}
          <Form {...form}>
            <form
              method="post"
              onSubmit={(event) => form.handleSubmit(onSubmit)(event)}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel className="text-sm font-medium">
                      用户名或邮箱
                    </FormLabel>
                    <FormControl>
                      <Input
                        autoComplete="username"
                        autoCapitalize="none"
                        spellCheck={false}
                        disabled={checkingSession || isLoading}
                        placeholder="请输入用户名或邮箱"
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
                  <FormItem className="space-y-2">
                    <FormLabel className="text-sm font-medium">密码</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          disabled={checkingSession || isLoading}
                          aria-label="密码"
                          placeholder="请输入密码"
                          className="pr-10"
                          {...field}
                        />
                      </FormControl>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? "隐藏密码" : "显示密码"}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
                        aria-pressed={showPassword}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="remember-login"
                    checked={rememberMe}
                    disabled={checkingSession || isLoading}
                    onCheckedChange={(value) => setRememberMe(value === true)}
                    aria-describedby="remember-login-description"
                  />
                  <label htmlFor="remember-login" className="text-sm">
                    保持登录
                  </label>
                </div>
                <p
                  id="remember-login-description"
                  className="text-xs leading-relaxed text-muted-foreground"
                >
                  在本机保持登录（公用电脑请勿勾选）
                </p>
              </div>
              {error && (
                <div className="flex items-start gap-2.5 rounded-md border border-destructive/20 bg-destructive/[0.06] px-4 py-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={!isClientReady || isLoading || checkingSession}
              >
                {isLoading || checkingSession ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {checkingSession ? "正在确认登录状态..." : "登录中..."}
                  </>
                ) : (
                  "登录"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex w-full justify-between pt-0 text-sm">
          <Link
            href="/register"
            className="text-primary underline-offset-4 hover:underline"
          >
            立即注册
          </Link>
          <Link
            href="/forgot-password"
            className="text-primary underline-offset-4 hover:underline"
          >
            忘记密码
          </Link>
        </CardFooter>
      </Card>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <AuthShell brandHeading>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中...
          </div>
        </AuthShell>
      }
    >
      <LoginFormClient />
    </Suspense>
  );
}
