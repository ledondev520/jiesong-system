from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from export_hscode_csv import record_to_row


class ExportHsCodeCsvTests(unittest.TestCase):
    def test_record_to_row_flattens_json_record(self):
        row = record_to_row(
            {
                "hs_code": "6904100000",
                "title": "6904100000的HS编码_陶瓷制建筑用砖_HS编码查询",
                "source_url": "https://www.hsbianma.com/Code/6904100000.html",
                "fetched_at": "2026-03-08T11:00:00+00:00",
                "basic_info": {
                    "商品编码": "6904100000",
                    "商品名称": "陶瓷制建筑用砖",
                    "商品描述": "用于建筑铺设",
                    "编码状态": "正常",
                    "更新时间": "2026/1/1",
                },
                "tax_info": {
                    "计量单位": "千克/千块",
                    "出口税率": "0%",
                    "出口退税税率": "9%",
                    "增值税率": "13%",
                },
                "declaration_elements": [
                    {"index": 0, "value": "品牌类型"},
                    {"index": 1, "value": "出口享惠情况"},
                ],
                "supervision_conditions": [{"value": "无"}],
                "inspection_quarantine": [{"code": "L", "value": "民用商品入境验证"}],
                "agreement_rates": {"东盟": "0%"},
                "rcep_rates": {"澳大利亚": "0%"},
                "chapter_hierarchy": [{"code": "69", "value": "陶瓷产品"}],
                "ciq_codes": [{"code": "6904100000999", "value": "陶瓷制建筑用砖"}],
            }
        )

        self.assertEqual(row["hs_code"], "6904100000")
        self.assertEqual(row["product_name"], "陶瓷制建筑用砖")
        self.assertEqual(row["export_refund_rate"], "9%")
        self.assertEqual(row["declaration_elements"], "0:品牌类型 | 1:出口享惠情况")
        self.assertEqual(row["inspection_quarantine"], "L:民用商品入境验证")
        self.assertEqual(row["agreement_rates_json"], '{"东盟": "0%"}')
        self.assertEqual(row["chapter_hierarchy"], "69:陶瓷产品")
        self.assertEqual(row["ciq_codes"], "6904100000999:陶瓷制建筑用砖")


if __name__ == "__main__":
    unittest.main()
