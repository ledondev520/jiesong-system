import tempfile
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from scrape_hscode_raw import (
    collect_search_codes,
    collect_keyword_codes_tree,
    extract_code_links,
    parse_chapter_list,
    parse_detail_page,
    rebuild_manifest_snapshot,
    write_json,
)


SEARCH_HTML = """
<html>
  <body>
    <a href="/Code/6904100000.html">6904100000</a>
    <a href="/Code/6904100000.html">详情</a>
    <a href="/Code/6907100010.html">6907100010</a>
    <a href="/Code/invalid.html">无效</a>
  </body>
</html>
"""


DETAIL_HTML = """
<html>
  <head>
    <title>6904100000的HS编码_陶瓷制建筑用砖_HS编码查询</title>
  </head>
  <body>
    <h3>基本信息</h3>
    <table>
      <tr><td>商品编码</td><td>6904100000</td></tr>
      <tr><td>商品名称</td><td>陶瓷制建筑用砖</td></tr>
      <tr><td>商品描述</td><td>用于建筑铺设</td></tr>
      <tr><td>编码状态</td><td>正常</td></tr>
      <tr><td>更新时间</td><td>2026/1/1</td></tr>
    </table>

    <h3>税率信息</h3>
    <table>
      <tr><td>计量单位</td><td>千克/千块</td></tr>
      <tr><td>出口税率</td><td>0%</td></tr>
      <tr><td>出口退税税率</td><td>9%</td></tr>
      <tr><td>出口暂定税率</td><td>无</td></tr>
      <tr><td>增值税率</td><td>13%</td></tr>
      <tr><td>最惠国税率</td><td>15%</td></tr>
      <tr><td>进口暂定税率</td><td></td></tr>
      <tr><td>进口普通税率</td><td>90%</td></tr>
      <tr><td>消费税率</td><td>无</td></tr>
    </table>

    <h3>申报要素</h3>
    <table>
      <tr><td>0</td><td>品牌类型</td></tr>
      <tr><td>1</td><td>出口享惠情况</td></tr>
      <tr><td>2</td><td>种类(建筑用砖)</td></tr>
    </table>

    <h3>监管条件 [ ? ]</h3>
    <table>
      <tr><td>无</td></tr>
    </table>

    <h3>检验检疫类别 [ ? ]</h3>
    <table>
      <tr><td>L</td><td>民用商品入境验证</td></tr>
    </table>

    <h3>协定税率</h3>
    <table>
      <tr><td>东盟</td><td>0%</td></tr>
      <tr><td>智利</td><td>0%</td></tr>
    </table>

    <h3>RCEP税率</h3>
    <table>
      <tr><td>澳大利亚</td><td>0%</td></tr>
    </table>

    <h3>所属章节</h3>
    <table>
      <tr><td>第13类</td><td>石料、石膏等制品</td></tr>
      <tr><td>69</td><td>陶瓷产品</td></tr>
      <tr><td>6904</td><td>陶瓷制建筑用砖</td></tr>
    </table>

    <h3>CIQ代码(13位海关编码)</h3>
    <table>
      <tr><td>6904100000999</td><td>陶瓷制建筑用砖</td></tr>
    </table>
  </body>
</html>
"""


class ScrapeHsCodeRawTests(unittest.TestCase):
    def test_extract_code_links_returns_unique_10_digit_codes(self):
        self.assertEqual(
            extract_code_links(SEARCH_HTML),
            ["6904100000", "6907100010"],
        )

    def test_parse_detail_page_extracts_all_visible_sections(self):
        record = parse_detail_page(DETAIL_HTML, source_url="https://www.hsbianma.com/Code/6904100000.html")

        self.assertEqual(record["hs_code"], "6904100000")
        self.assertEqual(record["title"], "6904100000的HS编码_陶瓷制建筑用砖_HS编码查询")
        self.assertEqual(record["basic_info"]["商品名称"], "陶瓷制建筑用砖")
        self.assertEqual(record["tax_info"]["出口退税税率"], "9%")
        self.assertEqual(record["declaration_elements"][2]["value"], "种类(建筑用砖)")
        self.assertEqual(record["supervision_conditions"][0]["value"], "无")
        self.assertEqual(record["inspection_quarantine"][0]["code"], "L")
        self.assertEqual(record["agreement_rates"]["东盟"], "0%")
        self.assertEqual(record["rcep_rates"]["澳大利亚"], "0%")
        self.assertEqual(record["chapter_hierarchy"][1]["code"], "69")
        self.assertEqual(record["ciq_codes"][0]["code"], "6904100000999")

    def test_collect_search_codes_retries_when_first_page_is_empty(self):
        responses = iter(
            [
                "<html><head><title>页面提示_HS编码网</title></head><body>页面提示</body></html>",
                SEARCH_HTML,
            ]
        )

        def fake_fetcher(_session, _url, _delay):
            return next(responses)

        codes = collect_search_codes(
            session=None,
            keyword="69",
            page=1,
            request_delay=0,
            fetcher=fake_fetcher,
            empty_retry_count=2,
        )

        self.assertEqual(codes, ["6904100000", "6907100010"])

    def test_collect_keyword_codes_tree_refines_truncated_prefix_queries(self):
        search_pages = {
            ("84", 1): "".join(
                f'<a href="/Code/84010000{i:02d}.html">code{i:02d}</a>'
                for i in range(20)
            ),
            ("84", 2): "".join(
                f'<a href="/Code/84010001{i:02d}.html">code{i:02d}</a>'
                for i in range(20)
            ),
            ("8401", 1): """
                <a href="/Code/8401100000.html">8401100000</a>
                <a href="/Code/8401200000.html">8401200000</a>
            """,
            ("8417", 1): """
                <a href="/Code/8417100000.html">8417100000</a>
            """,
        }

        def fake_fetcher(_session, url, _delay):
            keyword = url.split("keywords=")[-1]
            page = int(url.split("/Search/")[1].split("?")[0])
            return f"<html><body>{search_pages.get((keyword, page), '')}</body></html>"

        summary = collect_keyword_codes_tree(
            session=None,
            keyword="84",
            request_delay=0,
            max_pages=2,
            fetcher=fake_fetcher,
        )

        self.assertTrue(summary["refined"])
        self.assertIn("8401", summary["expanded_keywords"])
        self.assertIn("8417", summary["expanded_keywords"])
        self.assertIn("8401100000", summary["codes"])
        self.assertIn("8417100000", summary["codes"])

    def test_parse_chapter_list_preserves_4digit_prefixes(self):
        self.assertEqual(
            parse_chapter_list("03,84,0307,8421"),
            ["03", "84", "0307", "8421"],
        )

    def test_rebuild_manifest_snapshot_counts_existing_records(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir)
            records_dir = output_dir / "records"
            write_json(records_dir / "0101101010.json", {"hs_code": "0101101010"})
            write_json(records_dir / "2901100000.json", {"hs_code": "2901100000"})

            manifest = rebuild_manifest_snapshot(output_dir)

            self.assertEqual(manifest["record_count"], 2)
            self.assertEqual(manifest["chapter_prefix_counts"]["01"], 1)
            self.assertEqual(manifest["chapter_prefix_counts"]["29"], 1)


if __name__ == "__main__":
    unittest.main()
