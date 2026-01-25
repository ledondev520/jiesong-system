#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Input: update0117.csv (报关记录), 出口合同明细.csv (外销合同)
Output: docs/出口合同汇总.csv (合并后的数据)
Pos: 数据合并脚本

Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
"""

import pandas as pd
import os

# 文件路径
UPDATE_CSV = '/Users/helena/Cursor/jiesong_system/update0117.csv'
EXPORT_CSV = '/Users/helena/Cursor/jiesong_system/docs/出口合同明细.csv'
OUTPUT_CSV = '/Users/helena/Cursor/jiesong_system/docs/出口合同汇总.csv'

def normalize_contract_no(contract_no):
    """标准化合同号格式"""
    if pd.isna(contract_no):
        return ''
    s = str(contract_no).strip()
    # 移除前缀空格和统一格式
    s = s.replace(' ', '')
    # 处理 EXP250010 和 EXP2500010 的差异
    return s

def main():
    print('=== 合并出口合同数据 ===\n')
    
    # 1. 读取报关记录
    print('1. 读取报关记录 (update0117.csv)...')
    update_df = pd.read_csv(UPDATE_CSV, encoding='utf-8-sig')
    print(f'   共 {len(update_df)} 条记录')
    
    # 2. 读取出口合同明细
    print('2. 读取出口合同明细...')
    export_df = pd.read_csv(EXPORT_CSV, encoding='utf-8-sig')
    print(f'   共 {len(export_df)} 条记录')
    
    # 3. 标准化合同号
    update_df['合同号_标准'] = update_df['合同号'].apply(normalize_contract_no)
    export_df['合同号_标准'] = export_df['合同号'].apply(normalize_contract_no)
    
    # 4. 按合同号和商品名合并
    print('3. 合并数据...')
    
    # 创建输出记录
    merged_records = []
    
    # 按合同号分组报关记录
    update_by_contract = update_df.groupby('合同号_标准')
    
    # 遍历出口合同明细
    for _, export_row in export_df.iterrows():
        exp_no = export_row['合同号_标准']
        product_name = str(export_row['商品名称']).strip()
        
        # 在报关记录中查找匹配的记录
        matching = None
        if exp_no in update_by_contract.groups:
            contract_items = update_df[update_df['合同号_标准'] == exp_no]
            # 精确匹配商品名
            exact_match = contract_items[contract_items['报关名'] == product_name]
            if len(exact_match) > 0:
                matching = exact_match.iloc[0]
            else:
                # 模糊匹配（包含关系）
                for _, row in contract_items.iterrows():
                    baoguan_name = str(row['报关名']).strip()
                    if product_name in baoguan_name or baoguan_name in product_name:
                        matching = row
                        break
                    # 前4个字符匹配
                    if len(product_name) >= 4 and len(baoguan_name) >= 4:
                        if product_name[:4] == baoguan_name[:4]:
                            matching = row
                            break
        
        if matching is not None:
            purchase_amount = matching.get(' 采购金额 ', '')
            # 清理采购金额（移除逗号）
            if pd.notna(purchase_amount) and str(purchase_amount).strip():
                purchase_amount = str(purchase_amount).replace(',', '').strip()
            else:
                purchase_amount = ''
                
            merged_records.append({
                '出口合同号': export_row['合同号'],
                '发货店铺': export_row.get('发货店铺', ''),
                '商品名称': product_name,
                '规格': export_row.get('规格', ''),
                '数量': export_row.get('数量', 0),
                '售出单价USD': export_row.get('单价USD', 0),
                '售出总价USD': export_row.get('总价USD', 0),
                '购销合同号': matching.get('购销合同号', '') if pd.notna(matching.get('购销合同号', '')) else '',
                '采购金额RMB': purchase_amount,
                '厂家': matching.get('厂家', '') if pd.notna(matching.get('厂家', '')) else '',
                '毛重': matching.get('毛重', '') if pd.notna(matching.get('毛重', '')) else '',
                '体积': matching.get(' 体积 ', '') if pd.notna(matching.get(' 体积 ', '')) else '',
            })
        else:
            # 未匹配到，只保留出口数据
            merged_records.append({
                '出口合同号': export_row['合同号'],
                '发货店铺': export_row.get('发货店铺', ''),
                '商品名称': product_name,
                '规格': export_row.get('规格', ''),
                '数量': export_row.get('数量', 0),
                '售出单价USD': export_row.get('单价USD', 0),
                '售出总价USD': export_row.get('总价USD', 0),
                '购销合同号': '',
                '采购金额RMB': '',
                '厂家': '',
                '毛重': '',
                '体积': '',
            })
    
    # 5. 转为DataFrame并保存
    result_df = pd.DataFrame(merged_records)
    
    # 统计匹配情况 - 采购金额非空且不是 nan
    has_amount = result_df[
        (result_df['采购金额RMB'] != '') & 
        (result_df['采购金额RMB'].astype(str) != 'nan') &
        (result_df['采购金额RMB'].notna())
    ]
    matched = len(has_amount)
    unmatched = len(result_df) - matched
    
    print(f'   匹配成功: {matched} 条')
    print(f'   未匹配: {unmatched} 条')
    
    # 按合同号排序
    result_df = result_df.sort_values(['出口合同号', '商品名称'])
    
    # 保存
    result_df.to_csv(OUTPUT_CSV, index=False, encoding='utf-8-sig')
    
    print(f'\n=== 完成 ===')
    print(f'输出文件: {OUTPUT_CSV}')
    print(f'共 {len(result_df)} 条记录')
    
    # 显示有采购金额的前10条
    print('\n=== 有采购金额的预览 ===')
    for _, row in has_amount.head(15).iterrows():
        print(f"{row['出口合同号']}: {row['商品名称']} - 售出${row['售出总价USD']} | 采购¥{row['采购金额RMB']}")

if __name__ == '__main__':
    main()
