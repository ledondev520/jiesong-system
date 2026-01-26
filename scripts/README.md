# scripts 目录

若本文件夹结构或内容变化，请更新本文件。

## 目的
存放数据导入、修复、提取等脚本。

## 文件清单

| 文件名 | 地位 | 功能 |
|--------|------|------|
| fix_export_contracts.js | 数据修复 | 修复出口合同的美元金额 + 创建装箱明细（已修正箱数逻辑） |
| fix_boxes_data.js | 数据修复 | 修复EXP25合同中被错误填充的箱数数据（置空处理） |
| import_contracts_data.js | 数据导入 | 导入采购合同数据 |
| import_declaration_data.js | 数据导入 | 导入报关单数据 |
| import_export_contracts.js | 数据导入 | 导入出口合同数据 |
| extract_contracts.py | 数据提取 | Python脚本，提取合同数据 |
| extract_export_contracts.py | 数据提取 | 提取出口合同数据 |
| extract_export_complete.py | 数据提取 | 完整提取出口数据 |
| merge_export_data.py | 数据合并 | 合并出口数据 |
| debug_contract.py | 调试工具 | 调试合同数据 |

## 使用说明

### JavaScript 脚本
```bash
# 在 backend 目录下执行（需要 Prisma 环境）
node ../scripts/fix_export_contracts.js
node ../scripts/fix_boxes_data.js
```

### Python 脚本
```bash
python scripts/extract_contracts.py
```

## 更新记录
- 2026-01-26: 修正 fix_export_contracts.js 中的箱数逻辑，新增 fix_boxes_data.js
