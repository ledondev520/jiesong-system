/**
 * Input: 旧运维中心入口 /dashboard/system
 * Output: 服务端重定向到 /dashboard/settings（运维入口已在设置页 OpsTab）
 * Pos: 旧 URL 重定向桩（UX 规范 §3.4）
 */
import { redirect } from "next/navigation";

export default function SystemHomeRedirectPage() {
  redirect("/dashboard/settings");
}
