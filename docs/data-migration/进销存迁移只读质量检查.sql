-- 进销存迁移只读质量检查
-- 用法：sqlite3 -readonly backend/prisma/dev.db < docs/data-migration/进销存迁移只读质量检查.sql
-- 该脚本只输出计数和完整性指标，不输出供应商、联系人、账号或财务明细值。

.headers on
.mode column

PRAGMA query_only = ON;

SELECT 'integrity_check' AS section, integrity_check AS result
FROM pragma_integrity_check;

SELECT 'foreign_key_violations' AS metric, COUNT(*) AS value
FROM pragma_foreign_key_check;

SELECT 'suppliers' AS table_name, COUNT(*) AS row_count FROM suppliers
UNION ALL SELECT 'supplier_aliases', COUNT(*) FROM supplier_aliases
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'product_suppliers', COUNT(*) FROM product_suppliers
UNION ALL SELECT 'purchase_contracts', COUNT(*) FROM purchase_contracts
UNION ALL SELECT 'purchase_items', COUNT(*) FROM purchase_items
UNION ALL SELECT 'ports', COUNT(*) FROM ports
UNION ALL SELECT 'stores', COUNT(*) FROM stores
UNION ALL SELECT 'sales_contracts', COUNT(*) FROM sales_contracts
UNION ALL SELECT 'sales_items', COUNT(*) FROM sales_items
UNION ALL SELECT 'packing_items', COUNT(*) FROM packing_items
UNION ALL SELECT 'inventories', COUNT(*) FROM inventories
UNION ALL SELECT 'payments', COUNT(*) FROM payments
UNION ALL SELECT 'finance_data_batches', COUNT(*) FROM finance_data_batches
UNION ALL SELECT 'bank_transactions', COUNT(*) FROM bank_transactions
UNION ALL SELECT 'invoice_records', COUNT(*) FROM invoice_records;

SELECT 'supplier_missing_tax_id' AS metric,
       SUM(CASE WHEN taxId IS NULL OR TRIM(taxId) = '' THEN 1 ELSE 0 END) AS missing,
       COUNT(*) AS denominator
FROM suppliers
UNION ALL
SELECT 'supplier_missing_contact',
       SUM(CASE WHEN (contactName IS NULL OR TRIM(contactName) = '')
                     AND (contactPhone IS NULL OR TRIM(contactPhone) = '')
                     AND (phone IS NULL OR TRIM(phone) = '') THEN 1 ELSE 0 END),
       COUNT(*)
FROM suppliers
UNION ALL
SELECT 'supplier_missing_address',
       SUM(CASE WHEN address IS NULL OR TRIM(address) = '' THEN 1 ELSE 0 END),
       COUNT(*)
FROM suppliers
UNION ALL
SELECT 'supplier_missing_bank_account',
       SUM(CASE WHEN bankAccount IS NULL OR TRIM(bankAccount) = '' THEN 1 ELSE 0 END),
       COUNT(*)
FROM suppliers
UNION ALL
SELECT 'supplier_without_alias',
       SUM(CASE WHEN NOT EXISTS (
         SELECT 1 FROM supplier_aliases a WHERE a.supplierId = s.id
       ) THEN 1 ELSE 0 END),
       COUNT(*)
FROM suppliers s
UNION ALL
SELECT 'product_missing_specification',
       SUM(CASE WHEN specification IS NULL OR TRIM(specification) = '' THEN 1 ELSE 0 END),
       COUNT(*)
FROM products
UNION ALL
SELECT 'product_missing_unit',
       SUM(CASE WHEN unit IS NULL OR TRIM(unit) = '' THEN 1 ELSE 0 END),
       COUNT(*)
FROM products
UNION ALL
SELECT 'product_missing_hs_code',
       SUM(CASE WHEN hsCode IS NULL OR TRIM(hsCode) = '' THEN 1 ELSE 0 END),
       COUNT(*)
FROM products
UNION ALL
SELECT 'product_missing_category',
       SUM(CASE WHEN categoryId IS NULL OR TRIM(categoryId) = '' THEN 1 ELSE 0 END),
       COUNT(*)
FROM products
UNION ALL
SELECT 'product_without_product_supplier',
       SUM(CASE WHEN NOT EXISTS (
         SELECT 1 FROM product_suppliers ps WHERE ps.productId = p.id
       ) THEN 1 ELSE 0 END),
       COUNT(*)
FROM products p;

SELECT 'duplicate_supplier_names' AS metric, COUNT(*) AS value
FROM (
  SELECT TRIM(name)
  FROM suppliers
  GROUP BY TRIM(name)
  HAVING COUNT(*) > 1
)
UNION ALL
SELECT 'duplicate_supplier_tax_ids', COUNT(*)
FROM (
  SELECT TRIM(taxId)
  FROM suppliers
  WHERE taxId IS NOT NULL AND TRIM(taxId) <> ''
  GROUP BY TRIM(taxId)
  HAVING COUNT(*) > 1
)
UNION ALL
SELECT 'duplicate_product_candidate_keys', COUNT(*)
FROM (
  SELECT TRIM(customsName), COALESCE(TRIM(specification), ''), COALESCE(TRIM(unit), '')
  FROM products
  GROUP BY 1, 2, 3
  HAVING COUNT(*) > 1
)
UNION ALL
SELECT 'empty_purchase_contracts', COUNT(*)
FROM purchase_contracts pc
WHERE NOT EXISTS (
  SELECT 1 FROM purchase_items pi WHERE pi.purchaseContractId = pc.id
)
UNION ALL
SELECT 'empty_sales_contracts', COUNT(*)
FROM sales_contracts sc
WHERE NOT EXISTS (
  SELECT 1 FROM sales_items si WHERE si.salesContractId = sc.id
);

WITH historical AS (
  SELECT DISTINCT pi.productId, pc.supplierId
  FROM purchase_items pi
  JOIN purchase_contracts pc ON pc.id = pi.purchaseContractId
), declared AS (
  SELECT DISTINCT productId, supplierId
  FROM product_suppliers
)
SELECT 'historical_product_supplier_pairs' AS metric, COUNT(*) AS value
FROM historical
UNION ALL
SELECT 'declared_product_supplier_pairs', COUNT(*) FROM declared
UNION ALL
SELECT 'historical_pairs_missing_declared_mapping', COUNT(*)
FROM historical h
WHERE NOT EXISTS (
  SELECT 1 FROM declared d
  WHERE d.productId = h.productId AND d.supplierId = h.supplierId
)
UNION ALL
SELECT 'declared_pairs_without_purchase_history', COUNT(*)
FROM declared d
WHERE NOT EXISTS (
  SELECT 1 FROM historical h
  WHERE h.productId = d.productId AND h.supplierId = d.supplierId
)
UNION ALL
SELECT 'products_with_one_historical_supplier', COUNT(*)
FROM (
  SELECT productId FROM historical GROUP BY productId HAVING COUNT(*) = 1
)
UNION ALL
SELECT 'products_with_multiple_historical_suppliers', COUNT(*)
FROM (
  SELECT productId FROM historical GROUP BY productId HAVING COUNT(*) > 1
);

SELECT 'packing_item_without_purchase_item' AS metric, COUNT(*) AS value
FROM packing_items
WHERE purchaseItemId IS NULL
UNION ALL
SELECT 'inventory_without_purchase_item', COUNT(*)
FROM inventories
WHERE purchaseItemId IS NULL
UNION ALL
SELECT 'inventory_without_sales_item', COUNT(*)
FROM inventories
WHERE salesItemId IS NULL
UNION ALL
SELECT 'inventory_without_any_source', COUNT(*)
FROM inventories
WHERE purchaseItemId IS NULL AND salesItemId IS NULL
UNION ALL
SELECT 'outbound_inventory_without_sales_contract', COUNT(*)
FROM inventories
WHERE status = 'OUTBOUND' AND salesContractId IS NULL
UNION ALL
SELECT 'sales_item_without_matching_packing', COUNT(*)
FROM sales_items si
WHERE NOT EXISTS (
  SELECT 1
  FROM packing_items pki
  WHERE pki.salesContractId = si.salesContractId
    AND pki.productId = si.productId
    AND (pki.storeId = si.storeId OR pki.storeId IS NULL)
)
UNION ALL
SELECT 'payments_unlinked_to_contract', COUNT(*)
FROM payments
WHERE purchaseContractId IS NULL AND salesContractId IS NULL
UNION ALL
SELECT 'bank_transactions_unmatched', COUNT(*)
FROM bank_transactions
WHERE matchStatus <> 'MATCHED'
UNION ALL
SELECT 'invoice_records_unmatched', COUNT(*)
FROM invoice_records
WHERE matchStatus <> 'MATCHED';

SELECT status, COUNT(*) AS row_count
FROM inventories
GROUP BY status
ORDER BY status;
