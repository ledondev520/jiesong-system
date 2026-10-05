import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { PaymentDialog } from "./PaymentDialog";
import { PaymentType } from "@/types";

vi.mock("@/components/ui/date-picker", () => ({
  DatePicker: ({ date }: { date: Date }) => (
    <span data-testid="payment-date">{date.toISOString()}</span>
  ),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({
    onValueChange,
    value,
    disabled,
    children,
  }: {
    onValueChange: (value: string) => void;
    value: string;
    disabled?: boolean;
    children: React.ReactNode;
  }) => (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onValueChange("other")}
      >
        其他
      </button>
      <span data-testid="method">{value}</span>
      {children}
    </div>
  ),
  SelectContent: () => null,
  SelectItem: () => null,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: () => null,
}));

function Harness({
  submit,
  remaining = 100,
}: {
  submit: (data: unknown) => Promise<void>;
  remaining?: number;
}) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)}>重新打开</button>
      <PaymentDialog
        open={open}
        onOpenChange={setOpen}
        type={PaymentType.PAYABLE}
        contractId="synthetic"
        contractNo="测试"
        remainingAmount={remaining}
        onSubmit={async (data) => {
          await submit(data);
          setOpen(false);
        }}
      />
    </>
  );
}

const fillDraft = async () => {
  fireEvent.click(screen.getByText("其他"));
  fireEvent.change(screen.getByRole("spinbutton"), {
    target: { value: "22.6" },
  });
  fireEvent.change(screen.getByLabelText("备注"), {
    target: { value: "内部付款测试，仅合成数据" },
  });
  await waitFor(() => expect(screen.getByText("确认记录")).toBeEnabled());
};

it("submits numeric partial amounts; empty amounts cannot submit", async () => {
  const submit = vi.fn().mockResolvedValue(undefined);
  render(<Harness submit={submit} />);
  await fillDraft();
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "" } });
  await waitFor(() => expect(screen.getByText("确认记录")).toBeDisabled());
  fireEvent.change(screen.getByRole("spinbutton"), {
    target: { value: "12.34" },
  });
  await waitFor(() => expect(screen.getByText("确认记录")).toBeEnabled());
  fireEvent.click(screen.getByText("确认记录"));
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 12.34 }),
    ),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
});

it("preserves Chinese note, method, amount and exact date after failure, then retries unchanged", async () => {
  const submit = vi
    .fn()
    .mockRejectedValueOnce({ message: "网络连接失败，请检查网络后重试" })
    .mockResolvedValue(undefined);
  const view = render(<Harness submit={submit} />);
  await fillDraft();
  const date = screen.getByTestId("payment-date").textContent;
  fireEvent.click(screen.getByText("确认记录"));
  expect(await screen.findByRole("alert")).toHaveTextContent("网络连接失败");
  expect(screen.getByRole("spinbutton")).toHaveValue(22.6);
  expect(screen.getByLabelText("备注")).toHaveValue("内部付款测试，仅合成数据");
  expect(screen.getByTestId("method")).toHaveTextContent("other");
  expect(screen.getByTestId("payment-date")).toHaveTextContent(date!);
  view.rerender(<Harness submit={submit} remaining={90} />);
  expect(screen.getByRole("spinbutton")).toHaveValue(22.6);
  fireEvent.click(screen.getByText("确认记录"));
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
  expect(submit.mock.calls[1][0]).toEqual(submit.mock.calls[0][0]);
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
});

it("guards rapid double submits and dismissal while pending", async () => {
  let resolve!: () => void;
  const submit = vi.fn(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  render(<Harness submit={submit} />);
  await fillDraft();
  const form = screen.getByText("确认记录").closest("form")!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  expect(screen.getByText("提交中...")).toBeDisabled();
  expect(screen.getByRole("spinbutton")).toBeDisabled();
  fireEvent.click(screen.getByText("取消"));
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await act(async () => resolve());
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
});

it("cancel sends nothing and starts a fresh draft on reopen", async () => {
  const submit = vi.fn().mockResolvedValue(undefined);
  render(<Harness submit={submit} />);
  await fillDraft();
  fireEvent.click(screen.getByText("取消"));
  expect(submit).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("重新打开"));
  expect(screen.getByRole("spinbutton")).toHaveValue(100);
  expect(screen.getByLabelText("备注")).toHaveValue("");
  expect(screen.getByTestId("method")).toHaveTextContent("");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
