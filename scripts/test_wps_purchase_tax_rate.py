"""Tax-rate text must retain its explicit percent unit."""
import unittest
from scripts.extract_wps_purchase_evidence import parse_tax_rate, parse_pdf_text_items, fill_fields, PurchaseEvidence

class TaxRateTest(unittest.TestCase):
    def test_explicit_percent_and_excel_fraction(self):
        for raw, expected in [('1%', 1), ('13%', 13), ('1％', 1), (0.01, 1), (0.13, 13)]:
            with self.subTest(raw=raw):
                self.assertEqual(parse_tax_rate(raw), expected)

    def test_pdf_and_text_context_preserve_percent(self):
        rows = parse_pdf_text_items('1 瓷砖 平方米 150 ￥212.8733 ￥31931 1% ￥319 ￥32250', 'synthetic.pdf')
        self.assertEqual(rows[0]['tax_rate'], 1)
        evidence = PurchaseEvidence('synthetic.txt', '.txt', [], 'ok')
        fill_fields(evidence, '含税1%增值税', [])
        self.assertEqual(evidence.tax_rate, 1)

if __name__ == '__main__':
    unittest.main()
