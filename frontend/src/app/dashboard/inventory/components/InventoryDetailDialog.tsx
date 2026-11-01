/**
 * Input: 库存列表中已加载的一条库存记录、状态/数量展示文本
 * Output: 只读库存详情弹窗（商品、数量、状态、来源合同、入/出库时间、备注）；不发起任何写请求
 * Pos: 库存页行内「详情」入口，状态变更仍只走列表既有的确认流程
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Inventory } from "@/types";

const day = (value?: string) => (value ? value.slice(0, 10) : undefined);

export function InventoryDetailDialog({
  item,
  statusLabel,
  quantityLabel,
  onClose,
}: {
  item: Inventory | null;
  statusLabel: string;
  quantityLabel: string;
  onClose: () => void;
}) {
  const facts: [string, string | undefined][] = item
    ? [
        ["规格", item.product?.specification],
        ["HS 编码", item.product?.hsCode],
        ["数量", quantityLabel],
        ["当前状态", statusLabel],
        ["来源采购合同", item.purchaseItem?.purchaseContract?.contractNo],
        [
          "流转方式",
          item.purchaseItemId || item.receiptInspectionId
            ? "随到货验货、出口发运自动流转"
            : "手工流转",
        ],
        ["入库时间", day(item.inboundAt)],
        ["出库时间", day(item.outboundAt)],
        ["备注", item.note],
      ]
    : [];
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item?.product?.customsName || "库存详情"}</DialogTitle>
          <DialogDescription>
            只读详情，状态变更请在列表中操作。
          </DialogDescription>
        </DialogHeader>
        <dl className="grid gap-3 sm:grid-cols-2">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-sm">{value || "—"}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
