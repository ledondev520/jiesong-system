/** Input: selected user; Output: explicit identity/role review and account activation, preserving inactive state until confirmed. */
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { User, Role } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const userSchema = z.object({
  username: z.string().min(1, "用户名必填"),
  name: z.string().min(1, "姓名必填"),
  password: z.string().optional(), // Optional for edit
  role: z.nativeEnum(Role),
  isActive: z.boolean(),
});

type UserFormValues = z.infer<typeof userSchema>;

interface UserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: User | null;
  onSubmit: (data: UserFormValues) => Promise<void>;
}

export function UserDialog(props: UserDialogProps) {
  // A dismissed review must not retain an unsaved activation or another user's edits.
  // Failed saves remain in the same open session, so their edits are preserved.
  return props.open ? (
    <UserDialogSession key={props.user?.id ?? "new"} {...props} />
  ) : null;
}

function UserDialogSession({
  open,
  onOpenChange,
  user,
  onSubmit,
}: UserDialogProps) {
  const [submitError, setSubmitError] = useState("");
  const form = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      username: "",
      name: "",
      password: "",
      role: Role.SALES,
      isActive: true,
    },
    values: user
      ? {
          username: user.username,
          name: user.name,
          password: "",
          role: user.role,
          isActive: user.isActive,
        }
      : undefined,
  });

  const handleSubmit = async (data: UserFormValues) => {
    setSubmitError("");
    try {
      await onSubmit(data);
      form.reset();
    } catch {
      setSubmitError("保存失败，修改内容已保留，请重试。");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {user
              ? user.isActive
                ? "编辑用户"
                : "核对并开通账号"
              : "新增用户"}
          </DialogTitle>
          <DialogDescription>
            {user && !user.isActive
              ? "核对申请人、账号邮箱和角色。当前账号可能尚未开通或已停用；确认可以访问后，再打开下方「账号开通」并保存。不要向申请人索取密码或验证码。"
              : "核对身份与角色权限，管理账号的登录资格。"}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>用户名 (登录账号)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="例如: admin"
                      {...field}
                      disabled={!!user}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>显示姓名</FormLabel>
                  <FormControl>
                    <Input placeholder="例如: 张三" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>密码 {user && "(留空则不修改)"}</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="******" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>角色权限</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="选择角色" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={Role.BOSS}>
                        老板（业务只读）
                      </SelectItem>
                      <SelectItem value={Role.ADMIN}>
                        管理员 (所有权限)
                      </SelectItem>
                      <SelectItem value={Role.PURCHASE}>采购人员</SelectItem>
                      <SelectItem value={Role.SALES}>销售人员</SelectItem>
                      <SelectItem value={Role.FINANCE}>财务人员</SelectItem>
                      <SelectItem value={Role.WAREHOUSE}>仓库人员</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {user && (
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4 rounded-lg border p-3">
                    <div>
                      <FormLabel>账号开通</FormLabel>
                      <p className="mt-1 text-xs text-muted-foreground">
                        确认身份与角色后开启，关闭后无法登录。
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
            {submitError && (
              <p role="alert" className="text-sm text-destructive">
                {submitError}
              </p>
            )}
            <DialogFooter>
              <Button
                type="submit"
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
              >
                {form.formState.isSubmitting ? "保存中..." : "保存"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
