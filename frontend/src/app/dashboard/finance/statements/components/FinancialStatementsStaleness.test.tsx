/**
 * Input: 已导入账期与「今天」
 * Output: 数据截至提示；滞后 2 个月及以上写明已滞后
 * Pos: FinancialStatementsStaleness 展示测试
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FinancialStatementsStaleness } from "./FinancialStatementsStaleness";

const periods = [
  { year: 2026, month: 6 },
  { year: 2026, month: 7 },
];

describe("FinancialStatementsStaleness", () => {
  it("says the data is as of 2026年7月 and how far behind it is", () => {
    render(
      <FinancialStatementsStaleness
        periods={periods}
        now={new Date("2026-11-01T02:00:00Z")}
      />,
    );
    const note = screen.getByTestId("statements-as-of");
    expect(note).toHaveTextContent("数据截至 2026年7月");
    expect(note).toHaveTextContent("当前是 2026年11月，最新账期已滞后 4 个月");
  });

  it("only shows the as-of badge when the data is current enough", () => {
    render(
      <FinancialStatementsStaleness
        periods={periods}
        now={new Date("2026-08-10T00:00:00Z")}
      />,
    );
    const note = screen.getByTestId("statements-as-of");
    expect(note).toHaveTextContent("数据截至 2026年7月");
    expect(note).not.toHaveTextContent("已滞后");
  });

  it("renders nothing without periods", () => {
    const { container } = render(<FinancialStatementsStaleness periods={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
