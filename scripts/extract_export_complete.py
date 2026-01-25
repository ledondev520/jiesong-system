#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: 捷淞汇总 工作区的 EXP 开头的 Excel 文件（合同+箱单）
Output: docs/出口合同完整明细.csv
Pos: 数据提取脚本 - 完整版（含箱单信息）

Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
"""

import os
import re
import csv
import pandas as pd

SOURCE_DIR = '/Users/helena/Downloads/捷淞汇总'
UPDATE_CSV = '/Users/helena/Cursor/jiesong_system/update0117.csv'
OUTPUT_CSV = '/Users/helena/Cursor/jiesong_system/docs/出口合同完整明细.csv'

def find_sheet(sheets, keywords):
    """查找包含关键字的工作表"""
    for name in sheets.keys():
        if all(k in name for k in keywords):
            return sheets[name], name
    return None, None

def extract_contract_no(df):
    """从数据框提取合同号"""
    for i in range(min(5, len(df))):
        row = df.iloc[i]
        for col in row:
            if pd.notna(col):
                match = re.search(r'NO\.?:?\s*(EXP\d+)', str(col))
                if match:
                    return match.group(1)
    return None

def extract_store_name(df):
    """从数据框提取店铺名"""
    if len(df.columns) > 0:
        last_col = df.columns[-1]
        first_val = df.iloc[0][last_col]
        if pd.notna(first_val) and str(first_val).strip():
            return str(first_val).strip()
    return ''

def extract_packing_data(file_path):
    """从箱单工作表提取数据"""
    try:
        sheets = pd.read_excel(file_path, sheet_name=None)
        
        # 查找合同工作表获取合同号和店铺
        contract_df, _ = find_sheet(sheets, ['合', '同'])
        packing_df, _ = find_sheet(sheets, ['箱', '单'])
        
        if packing_df is None:
            return []
        
        contract_no = extract_contract_no(packing_df) or extract_contract_no(contract_df) if contract_df is not None else None
        if not contract_no:
            filename = os.path.basename(file_path)
            match = re.search(r'EXP\d+', filename)
            if match:
                contract_no = match.group(0)
        
        if not contract_no:
            return []
        
        store_name = extract_store_name(contract_df) if contract_df is not None else ''
        
        # 查找表头行
        header_row = -1
        for i in range(min(15, len(packing_df))):
            row = packing_df.iloc[i]
            for col in row:
                if pd.notna(col) and '货物名称' in str(col):
                    header_row = i
                    break
            if header_row >= 0:
                break
        
        if header_row < 0:
            return []
        
        # 获取列索引
        header = packing_df.iloc[header_row]
        col_map = {}
        for idx, val in enumerate(header):
            if pd.notna(val):
                val_str = str(val)
                if '货物名称' in val_str:
                    col_map['product'] = idx
                elif 'HSCODE' in val_str.upper() or 'HS' in val_str.upper():
                    col_map['hscode'] = idx
                elif '尺寸' in val_str or '规格' in val_str:
                    col_map['spec'] = idx
                elif '数量' in val_str and '箱' in val_str:
                    col_map['boxes'] = idx
                elif '毛重' in val_str:
                    col_map['gross_weight'] = idx
                elif '净重' in val_str:
                    col_map['net_weight'] = idx
                elif '体积' in val_str:
                    col_map['volume'] = idx
                elif val_str.strip() == '数量':
                    col_map['quantity'] = idx
                elif '单位' in val_str:
                    col_map['unit'] = idx
        
        # 提取数据
        items = []
        for i in range(header_row + 1, len(packing_df)):
            row = packing_df.iloc[i]
            first_cell = str(row.iloc[0]) if pd.notna(row.iloc[0]) else ''
            
            # 检查是否是合计行或空行
            if '总计' in first_cell or 'TOTOL' in first_cell or 'TOTAL' in first_cell:
                break
            
            try:
                item_no = row.iloc[0]
                if pd.isna(item_no):
                    continue
                try:
                    int(float(str(item_no)))
                except:
                    continue
                
                product_name = str(row.iloc[col_map.get('product', 1)]).strip() if col_map.get('product') else ''
                if not product_name or product_name == 'nan':
                    continue
                
                items.append({
                    '合同号': contract_no,
                    '发货店铺': store_name,
                    '商品名称': product_name,
                    'HS编码': str(row.iloc[col_map.get('hscode', 2)]).strip() if col_map.get('hscode') and pd.notna(row.iloc[col_map.get('hscode', 2)]) else '',
                    '规格': str(row.iloc[col_map.get('spec', 3)]).strip() if col_map.get('spec') and pd.notna(row.iloc[col_map.get('spec', 3)]) else '',
                    '箱数': float(row.iloc[col_map.get('boxes', 4)]) if col_map.get('boxes') and pd.notna(row.iloc[col_map.get('boxes', 4)]) else 0,
                    '毛重kg': float(row.iloc[col_map.get('gross_weight', 5)]) if col_map.get('gross_weight') and pd.notna(row.iloc[col_map.get('gross_weight', 5)]) else 0,
                    '净重kg': float(row.iloc[col_map.get('net_weight', 6)]) if col_map.get('net_weight') and pd.notna(row.iloc[col_map.get('net_weight', 6)]) else 0,
                    '体积cbm': float(row.iloc[col_map.get('volume', 7)]) if col_map.get('volume') and pd.notna(row.iloc[col_map.get('volume', 7)]) else 0,
                    '数量': float(row.iloc[col_map.get('quantity', 8)]) if col_map.get('quantity') and pd.notna(row.iloc[col_map.get('quantity', 8)]) else 0,
                    '单位': str(row.iloc[col_map.get('unit', 9)]).strip() if col_map.get('unit') and pd.notna(row.iloc[col_map.get('unit', 9)]) else '',
                })
            except Exception as e:
                continue
        
        return items
    except Exception as e:
        print(f"  Error: {e}")
        return []

def load_purchase_amounts():
    """加载采购金额数据"""
    df = pd.read_csv(UPDATE_CSV, encoding='utf-8-sig')
    # 创建 (合同号, 商品名) -> 采购金额 的映射
    amounts = {}
    for _, row in df.iterrows():
        if pd.notna(row['合同号']) and pd.notna(row['报关名']):
            key = (str(row['合同号']).strip(), str(row['报关名']).strip())
            amount = row.get(' 采购金额 ', '')
            if pd.notna(amount) and str(amount).strip():
                amounts[key] = str(amount).replace(',', '').strip()
    return amounts

def main():
    """主函数"""
    all_items = []
    
    # 加载采购金额
    print('加载采购金额数据...')
    purchase_amounts = load_purchase_amounts()
    print(f'  找到 {len(purchase_amounts)} 条采购金额记录')
    
    # 遍历所有 EXP 相关的 xlsx 文件
    print('\n提取箱单数据...')
    for root, dirs, files in os.walk(SOURCE_DIR):
        for file in files:
            if file.endswith('.xlsx') and 'EXP' in file:
                file_path = os.path.join(root, file)
                print(f"Processing: {file}")
                
                items = extract_packing_data(file_path)
                if items:
                    # 添加采购金额
                    for item in items:
                        key = (item['合同号'], item['商品名称'])
                        item['采购金额RMB'] = purchase_amounts.get(key, '')
                        # 模糊匹配
                        if not item['采购金额RMB']:
                            for (contract, product), amount in purchase_amounts.items():
                                if contract == item['合同号'] and (product in item['商品名称'] or item['商品名称'] in product):
                                    item['采购金额RMB'] = amount
                                    break
                        print(f"  + {item['合同号']}: {item['商品名称']} | {item['箱数']}箱 | 毛重{item['毛重kg']}kg | 体积{item['体积cbm']}cbm")
                    all_items.extend(items)
    
    # 按合同号排序
    all_items.sort(key=lambda x: x['合同号'])
    
    # 写入 CSV
    if all_items:
        fieldnames = ['合同号', '发货店铺', '商品名称', 'HS编码', '规格', '箱数', '毛重kg', '净重kg', '体积cbm', '数量', '单位', '采购金额RMB']
        with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8-sig') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(all_items)
    
    print(f"\n=== 完成 ===")
    print(f"共提取 {len(all_items)} 条商品记录")
    print(f"输出文件: {OUTPUT_CSV}")
    
    # 统计有采购金额的记录
    has_amount = len([i for i in all_items if i['采购金额RMB']])
    print(f"有采购金额: {has_amount} 条")

if __name__ == '__main__':
    main()
