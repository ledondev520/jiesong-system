/**
 * Input: 无
 * Output: 重定向到 /dashboard/customs/new
 * Pos: 旧新建报关单入口兼容 stub
 */
import { redirect } from "next/navigation";

export default function CreateCustomsDeclarationRedirectPage() {
  redirect("/dashboard/customs/new");
}
