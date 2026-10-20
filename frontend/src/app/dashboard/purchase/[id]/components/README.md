# 采购详情流程组件

- `PurchaseFlowPanel.tsx` / `.test.tsx`：付款与发票流程。保存付款失败向 `PaymentDialog` 传回原错误，保留草稿；成功保存后的刷新故障单独提示，不误报为付款失败
- `PurchaseProductionPanel.tsx` / `.test.tsx`：生产资料登记
- `PurchaseReceiptPanel.tsx` / `.test.tsx`：分批到货和验货

界面记录内部业务事实，不执行真实银行转账。
