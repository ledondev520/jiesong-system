/**
 * Input: 内联供应商表单状态
 * Output: 新增供应商弹窗（独立编辑会话）
 * Pos: 采购合同创建入口（CreatePurchasePageContent 拆分）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, UserPlus } from "lucide-react";
import { emptyNewSupplier } from "./purchaseFormParts";

export function NewSupplierDialog({
  showNewSupplierDialog,
  changeSupplierDialog,
  savingSupplier,
  newSupplierForm,
  setNewSupplierForm,
  handleSaveNewSupplier,
  dataLoading,
  loadError,
}: {
  showNewSupplierDialog: boolean;
  changeSupplierDialog: (open: boolean, name?: string) => void;
  savingSupplier: boolean;
  newSupplierForm: typeof emptyNewSupplier;
  setNewSupplierForm: Dispatch<SetStateAction<typeof emptyNewSupplier>>;
  handleSaveNewSupplier: () => unknown;
  dataLoading: boolean;
  loadError: boolean;
}) {
  return (
    <>
      <Dialog open={showNewSupplierDialog} onOpenChange={changeSupplierDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-medium">
              <UserPlus className="h-4 w-4" />
              新增供应商
            </DialogTitle>
            <DialogDescription>
              录入签约、汇款和开票所需的供应商档案。
            </DialogDescription>
          </DialogHeader>
          <fieldset disabled={savingSupplier} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-supplier-name">供应商名称 *</Label>
              <Input
                id="new-supplier-name"
                name="name"
                value={newSupplierForm.name}
                onChange={(e) =>
                  setNewSupplierForm((prev) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
                placeholder="例如：佛山市某某陶瓷有限公司"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-supplier-contact-name">联系人</Label>
                <Input
                  id="new-supplier-contact-name"
                  name="contactName"
                  value={newSupplierForm.contactName}
                  onChange={(e) =>
                    setNewSupplierForm((prev) => ({
                      ...prev,
                      contactName: e.target.value,
                    }))
                  }
                  placeholder="例如：张经理"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-supplier-contact-phone">联系电话</Label>
                <Input
                  id="new-supplier-contact-phone"
                  name="contactPhone"
                  value={newSupplierForm.contactPhone}
                  onChange={(e) =>
                    setNewSupplierForm((prev) => ({
                      ...prev,
                      contactPhone: e.target.value,
                    }))
                  }
                  placeholder="例如：138xxxxxxxx"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-supplier-address">公司地址</Label>
              <Input
                id="new-supplier-address"
                name="address"
                value={newSupplierForm.address}
                onChange={(e) =>
                  setNewSupplierForm((prev) => ({
                    ...prev,
                    address: e.target.value,
                  }))
                }
                placeholder="例如：广东省佛山市禅城区xxx"
              />
            </div>
            <div className="border-t pt-4">
              <p className="mb-3 text-sm font-medium">开票信息（合同用）</p>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-supplier-tax-id">纳税人识别号</Label>
                  <Input
                    id="new-supplier-tax-id"
                    name="taxId"
                    value={newSupplierForm.taxId}
                    onChange={(e) =>
                      setNewSupplierForm((prev) => ({
                        ...prev,
                        taxId: e.target.value,
                      }))
                    }
                    placeholder="例如：91440000xxxxxxxxxx"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-supplier-bank-account-name">
                    收款户名
                  </Label>
                  <Input
                    id="new-supplier-bank-account-name"
                    name="bankAccountName"
                    value={newSupplierForm.bankAccountName}
                    onChange={(e) =>
                      setNewSupplierForm((prev) => ({
                        ...prev,
                        bankAccountName: e.target.value,
                      }))
                    }
                    placeholder="供应商银行账户户名"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-supplier-bank-name">开户银行</Label>
                  <Input
                    id="new-supplier-bank-name"
                    name="bankName"
                    value={newSupplierForm.bankName}
                    onChange={(e) =>
                      setNewSupplierForm((prev) => ({
                        ...prev,
                        bankName: e.target.value,
                      }))
                    }
                    placeholder="例如：中国银行佛山禅城支行"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-supplier-bank-branch">开户支行</Label>
                  <Input
                    id="new-supplier-bank-branch"
                    name="bankBranch"
                    value={newSupplierForm.bankBranch}
                    onChange={(e) =>
                      setNewSupplierForm((prev) => ({
                        ...prev,
                        bankBranch: e.target.value,
                      }))
                    }
                    placeholder="例如：佛山祖庙支行"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-supplier-bank-code">
                    联行号 / 银行编号
                  </Label>
                  <Input
                    id="new-supplier-bank-code"
                    name="bankCode"
                    value={newSupplierForm.bankCode}
                    onChange={(e) =>
                      setNewSupplierForm((prev) => ({
                        ...prev,
                        bankCode: e.target.value,
                      }))
                    }
                    placeholder="银行联行号或编号"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-supplier-bank-account">银行账号</Label>
                  <Input
                    id="new-supplier-bank-account"
                    name="bankAccount"
                    value={newSupplierForm.bankAccount}
                    onChange={(e) =>
                      setNewSupplierForm((prev) => ({
                        ...prev,
                        bankAccount: e.target.value,
                      }))
                    }
                    placeholder="例如：6217xxxxxxxxxxxxxxxx"
                  />
                </div>
              </div>
            </div>
          </fieldset>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => changeSupplierDialog(false)}
            >
              取消
            </Button>
            <Button
              onClick={handleSaveNewSupplier}
              disabled={savingSupplier || dataLoading || loadError}
            >
              {savingSupplier ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  保存中...
                </>
              ) : (
                "保存供应商"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
