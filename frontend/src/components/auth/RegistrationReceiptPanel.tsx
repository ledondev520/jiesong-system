/** Input: local registration receipt; Output: truthful next steps for applicant and administrator. */
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { RegistrationReceipt } from "@/lib/registration-receipt";

export function RegistrationReceiptPanel({
  receipt,
}: {
  receipt: RegistrationReceipt;
}) {
  const [copyStatus, setCopyStatus] = useState("");
  const instructions = `请核对并开通我的捷淞账号：${receipt.email}。管理员路径：系统管理 → 账号管理 → 未开通/已停用 → 搜索此邮箱 → 核对并开通。请核对身份和角色；无需索取我的密码或验证码。`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(instructions);
      setCopyStatus("已复制，请通过你与管理员的常用联系方式发送。");
    } catch {
      setCopyStatus("复制未成功，请手动复制上面的邮箱和管理员操作路径。");
    }
  };
  return (
    <section
      aria-label="注册申请回执"
      className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm"
    >
      <p className="font-medium">申请已提交，下一步请联系管理员</p>
      <p className="break-all">申请账号：{receipt.email}</p>
      <ol className="list-decimal space-y-2 pl-5">
        <li>把账号邮箱发给负责捷淞系统的管理员。</li>
        <li>
          管理员进入「系统管理 → 账号管理 →
          未开通/已停用」，搜索邮箱，核对身份和角色后开通。
        </li>
        <li>管理员确认开通后，使用此邮箱和你设置的密码登录。</li>
      </ol>
      <p className="text-muted-foreground">
        这是当前标签页保存的提交回执，不是实时审核结果；请向管理员确认是否已开通。无需重复注册，也不要向管理员发送密码或验证码。
      </p>
      <Button type="button" variant="outline" onClick={() => void copy()}>
        复制给管理员的说明
      </Button>
      {copyStatus && <p role="status">{copyStatus}</p>}
    </section>
  );
}
