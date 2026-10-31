/**
 * Input: 旧公开页 /forex-verifications
 * Output: 服务端重定向到 /
 * Pos: 旧 URL 重定向桩（UX 规范 §3.4）；原营销页含捏造指标，已删除，业务功能在 /dashboard/customs
 */
import { redirect } from "next/navigation";

export default function ForexVerificationsPage() {
  redirect("/");
}
