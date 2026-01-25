#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: 捷淞汇总 工作区的 EXP 开头的 Excel 文件
Output: docs/出口合同明细.csv
Pos: 数据提取脚本

Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
"""

import os
import re
import csv
import pandas as pd

SOURCE_DIR = '/Users/helena/Downloads/捷淞汇总'
OUTPUT_CSV = '/Users/helena/Cursor/jiesong_system/docs/出口合同明细.csv'

def find_contract_sheet(sheets):
    """查找包含"合同"的工作表"""
    for name in sheets.keys():
        if '合' in name and '同' in name:
            return sheets[name], name
    return None, None

def extract_contract_data(file_path):
    """从单个 Excel 文件提取合同数据"""
    try:
        sheets = pd.read_excel(file_path, sheet_name=None)
        contract_df, sheet_name = find_contract_sheet(sheets)
        
        if contract_df is None:
            print(f"  Warning: 未找到合同工作表")
            return []
        
        # 提取合同号 - 在前5行中查找 NO.: EXPXXXX
        contract_no = ''
        store_name = ''
        for i in range(min(5, len(contract_df))):
            row = contract_df.iloc[i]
            for col in row:
                if pd.notna(col):
                    col_str = str(col)
                    # 查找合同号
                    match = re.search(r'NO\.?:?\s*(EXP\d+)', col_str)
                    if match:
                        contract_no = match.group(1)
        
        # 从最后一列提取店铺名（通常在第一行）
        if len(contract_df.columns) > 0:
            last_col = contract_df.columns[-1]
            first_val = contract_df.iloc[0][last_col]
            if pd.notna(first_val) and str(first_val).strip():
                store_name = str(first_val).strip()
        
        if not contract_no:
            # 从文件名提取
            filename = os.path.basename(file_path)
            match = re.search(r'EXP\d+', filename)
            if match:
                contract_no = match.group(0)
        
        if not contract_no:
            print(f"  Warning: 未找到合同号")
            return []
        
        # 查找商品数据行
        # 找到 "Item" 或 "货物名称" 行作为表头
        header_row = -1
        for i in range(min(15, len(contract_df))):
            row = contract_df.iloc[i]
            for col in row:
                if pd.notna(col) and ('货物名称' in str(col) or 'Item' == str(col).strip()):
                    header_row = i
                    break
            if header_row >= 0:
                break
        
        if header_row < 0:
            print(f"  Warning: 未找到商品表头")
            return []
        
        # 提取商品数据
        items = []
        for i in range(header_row + 1, len(contract_df)):
            row = contract_df.iloc[i]
            
            # 检查是否是合计行或空行
            first_cell = str(row.iloc[0]) if pd.notna(row.iloc[0]) else ''
            if '总计' in first_cell or 'TOTOL' in first_cell or 'TOTAL' in first_cell:
                break
            
            # 提取数据（根据列位置）
            try:
                item_no = row.iloc[0]  # 序号
                product_name = row.iloc[1]  # 商品名称
                spec = row.iloc[2]  # 规格/包装
                quantity = row.iloc[3]  # 数量
                unit_price = row.iloc[4]  # 单价
                total_price = row.iloc[5]  # 总价
                
                # 验证是否是有效数据行
                if pd.isna(product_name) or str(product_name).strip() == '':
                    continue
                if pd.isna(item_no):
                    continue
                
                # 尝试转换数字
                try:
                    item_no = int(float(str(item_no)))
                except:
                    continue  # 不是数字序号，跳过
                
                items.append({
                    '合同号': contract_no,
                    '发货店铺': store_name,
                    '商品名称': str(product_name).strip(),
                    '规格': str(spec).strip() if pd.notna(spec) else '',
                    '数量': float(quantity) if pd.notna(quantity) else 0,
                    '单价USD': float(unit_price) if pd.notna(unit_price) else 0,
                    '总价USD': float(total_price) if pd.notna(total_price) else 0,
                })
            except Exception as e:
                continue
        
        return items
    
    except Exception as e:
        print(f"  Error: {e}")
        return []

def main():
    """主函数"""
    all_items = []
    
    # 查找所有 EXP 相关的 xlsx 文件
    for root, dirs, files in os.walk(SOURCE_DIR):
        for file in files:
            if file.endswith('.xlsx') and 'EXP' in file:
                file_path = os.path.join(root, file)
                print(f"Processing: {file}")
                
                items = extract_contract_data(file_path)
                if items:
                    for item in items:
                        print(f"  + {item['合同号']}: {item['商品名称']} x {item['数量']} @ ${item['单价USD']}")
                    all_items.extend(items)
    
    # 按合同号排序
    all_items.sort(key=lambda x: x['合同号'])
    
    # 写入 CSV
    if all_items:
        with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8-sig') as f:
            fieldnames = ['合同号', '发货店铺', '商品名称', '规格', '数量', '单价USD', '总价USD']
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(all_items)
    
    print(f"\n=== 完成 ===")
    print(f"共提取 {len(all_items)} 条商品记录")
    print(f"输出文件: {OUTPUT_CSV}")

if __name__ == '__main__':
    main()
