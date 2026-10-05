/**
 * Input: Active ports and the existing store creation service
 * Output: Validated store creation, explicit retry, and the saved store for selection
 * Pos: Inline store creation in export-contract form; see ../README.md
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { storeService } from "@/services/store.service";
import type { Store } from "@/types";

const storeSchema = z.object({
  name: z.string().trim().min(1, "请输入门店名称"),
  portId: z.string().min(1, "请选择港口"),
  contactName: z.string().trim(),
  contactPhone: z.string().trim(),
  contactEmail: z.string().trim().email("请输入有效邮箱").or(z.literal("")),
  address: z.string().trim(),
});
type StoreFormValues = z.infer<typeof storeSchema>;

interface CreateStoreDialogProps {
  onClose: () => void;
  onRestoreFocus: () => void;
  onCreated: (store: Store) => void;
}

export function CreateStoreDialog({
  onClose,
  onRestoreFocus,
  onCreated,
}: CreateStoreDialogProps) {
  const [ports, setPorts] = useState<NonNullable<Store["port"]>[]>([]);
  const [portsLoading, setPortsLoading] = useState(true);
  const [portsError, setPortsError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveError, setSaveError] = useState("");
  const saving = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [savePending, setSavePending] = useState(false);
  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
      name: "",
      portId: "",
      contactName: "",
      contactPhone: "",
      contactEmail: "",
      address: "",
    },
  });

  useEffect(() => {
    let active = true;
    storeService.getPorts().then(
      (result) => {
        if (active) {
          setPorts(result.data || []);
          setPortsLoading(false);
        }
      },
      () => {
        if (active) {
          setPortsError(true);
          setPortsLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [loadAttempt]);

  const retryPorts = () => {
    setPortsLoading(true);
    setPortsError(false);
    setLoadAttempt((attempt) => attempt + 1);
  };

  const submit = async (values: StoreFormValues) => {
    if (saving.current || portsLoading || portsError) return;
    if (!ports.some((port) => port.id === values.portId)) {
      form.setError("portId", { message: "请选择可用港口" });
      return;
    }
    saving.current = true;
    setSavePending(true);
    setSaveError("");
    try {
      const result = await storeService.create(values);
      if (!mounted.current) return;
      if (!result.data?.id) throw new Error("Missing store ID");
      toast.success("门店创建成功，已选中");
      onCreated(result.data);
    } catch {
      if (mounted.current) setSaveError("门店保存失败，请检查后重试");
    } finally {
      saving.current = false;
      if (mounted.current) setSavePending(false);
    }
  };

  const pending = form.formState.isSubmitting || savePending;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving.current) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>新增门店</DialogTitle>
          <DialogDescription>
            保存后自动选中此门店，已填写的出口明细会保留。
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            noValidate
            className="space-y-4"
            onSubmit={(event) => {
              // Dialog portals still bubble React events to the surrounding sales form.
              event.stopPropagation();
              if (saving.current) {
                event.preventDefault();
                return;
              }
              void form.handleSubmit(submit)(event);
            }}
          >
            <fieldset disabled={pending} className="min-w-0 space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>门店名称 *</FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="organization" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="portId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>港口 *</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={
                        pending ||
                        portsLoading ||
                        portsError ||
                        ports.length === 0
                      }
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue
                            placeholder={
                              portsLoading ? "加载港口..." : "选择港口"
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ports.map((port) => (
                          <SelectItem key={port.id} value={port.id}>
                            {port.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!portsLoading && (portsError || ports.length === 0) && (
                <div
                  className="space-y-2 text-sm"
                  role={portsError ? "alert" : "status"}
                >
                  <p>
                    {portsError
                      ? "港口加载失败，请重试"
                      : "暂无可用港口，请联系管理员在系统设置中维护港口后重试。"}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={retryPorts}
                  >
                    重新加载港口
                  </Button>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="contactName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>联系人</FormLabel>
                      <FormControl>
                        <Input {...field} autoComplete="name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contactPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>联系电话</FormLabel>
                      <FormControl>
                        <Input {...field} type="tel" autoComplete="tel" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="contactEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>联系邮箱</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" autoComplete="email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>地址</FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="street-address" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {saveError && (
                <p role="alert" className="text-sm text-destructive">
                  {saveError}
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={portsLoading || portsError || ports.length === 0}
                >
                  {pending ? "保存中..." : "保存并选中"}
                </Button>
              </DialogFooter>
            </fieldset>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
