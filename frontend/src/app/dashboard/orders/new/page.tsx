/**
 * Input: 无
 * Output: 新建出口订单页（订单条款 + 商品 × 门店网格 + 实时报价）
 * Pos: 业务 > 出口订单 > 新建；旧 /dashboard/sales/create 仍可用，J19 迁移详情后改为重定向
 */
import { OrderEditor } from "@/components/orders/OrderEditor";

export default function NewOrderPage() {
  return <OrderEditor />;
}
