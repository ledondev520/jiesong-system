import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DataTable, type DataTableColumn } from "./data-table";

interface Row {
  id: string;
  name: string;
  qty: number;
}

const rows: Row[] = [
  { id: "b", name: "Beta", qty: 5 },
  { id: "a", name: "Alpha", qty: 20 },
  { id: "c", name: "Gamma", qty: 1 },
];

const columns: DataTableColumn<Row>[] = [
  {
    key: "name",
    header: "名称",
    cell: (r) => r.name,
    sortValue: (r) => r.name,
    hideable: false,
  },
  {
    key: "qty",
    header: "数量",
    cell: (r) => String(r.qty),
    sortValue: (r) => r.qty,
  },
];

const bodyNames = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent);

describe("DataTable", () => {
  it("渲染表头和行", () => {
    render(<DataTable columns={columns} data={rows} rowKey={(r) => r.id} />);
    expect(screen.getByText("名称")).toBeInTheDocument();
    expect(bodyNames()).toEqual(["Beta", "Alpha", "Gamma"]);
  });

  it("点击表头按数值升序、降序、取消排序", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns} data={rows} rowKey={(r) => r.id} />);

    await user.click(screen.getByText("数量"));
    expect(bodyNames()).toEqual(["Gamma", "Beta", "Alpha"]);
    await user.click(screen.getByText("数量"));
    expect(bodyNames()).toEqual(["Alpha", "Beta", "Gamma"]);
    await user.click(screen.getByText("数量"));
    expect(bodyNames()).toEqual(["Beta", "Alpha", "Gamma"]);
  });

  it("列显隐菜单可以隐藏非必需列，必需列不在菜单里", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns} data={rows} rowKey={(r) => r.id} />);

    await user.click(screen.getByRole("button", { name: "列" }));
    expect(screen.queryByRole("menuitemcheckbox", { name: "名称" })).toBeNull();
    await user.click(
      await screen.findByRole("menuitemcheckbox", { name: "数量" }),
    );
    // 菜单打开时页面其余部分对无障碍树隐藏，关闭后再断言表头
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("columnheader", { name: /数量/ })).toBeNull();
    expect(
      screen.getByRole("columnheader", { name: /名称/ }),
    ).toBeInTheDocument();
  });

  it("defaultHidden 的列初始不显示", () => {
    const cols: DataTableColumn<Row>[] = [
      columns[0],
      { ...columns[1], defaultHidden: true },
    ];
    render(<DataTable columns={cols} data={rows} rowKey={(r) => r.id} />);
    expect(screen.queryByRole("columnheader", { name: /数量/ })).toBeNull();
  });

  it("加载中显示加载态，不显示空态或数据", () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        rowKey={(r) => r.id}
        loading
        emptyTitle="暂无港口"
      />,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("暂无港口")).toBeNull();
  });

  it("出错时显示「失败的事：原因」和重试，且不显示旧数据与分页总数", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        error={{ message: "数据库忙" }}
        errorWhat="加载港口失败"
        onRetry={onRetry}
        pagination={{
          page: 1,
          pageSize: 20,
          total: 3,
          onPageChange: vi.fn(),
          onPageSizeChange: vi.fn(),
        }}
      />,
    );
    expect(screen.getByText("加载港口失败：数据库忙")).toBeInTheDocument();
    expect(screen.queryByText("Alpha")).toBeNull();
    expect(screen.queryByText(/共 3 条/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("无数据时显示空态文案和操作", () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        rowKey={(r) => r.id}
        emptyTitle="暂无港口"
        emptyAction={<button type="button">新增港口</button>}
      />,
    );
    expect(screen.getByText("暂无港口")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "新增港口" }),
    ).toBeInTheDocument();
  });

  it("行点击触发 onRowClick，操作列和复选框点击不触发", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    const onAction = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        onRowClick={onRowClick}
        renderActions={(r) => (
          <button type="button" onClick={onAction}>{`编辑${r.name}`}</button>
        )}
        selection={{ selectedIds: new Set(), onChange: vi.fn() }}
      />,
    );
    await user.click(screen.getByText("Alpha"));
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);

    await user.click(screen.getByRole("button", { name: "编辑Alpha" }));
    await user.click(screen.getAllByRole("checkbox", { name: "选择此行" })[0]);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it("搜索框有值时出现重置，点击清空；筛选 chip 反映 aria-pressed", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    function Harness() {
      const [q, setQ] = useState("abc");
      return (
        <DataTable
          columns={columns}
          data={rows}
          rowKey={(r) => r.id}
          search={{ value: q, onChange: setQ, placeholder: "搜索港口" }}
          filters={[{ key: "active", label: "仅启用", active: true, onToggle }]}
        />
      );
    }
    render(<Harness />);
    expect(screen.getByRole("button", { name: "仅启用" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "重置" }));
    expect(screen.getByLabelText("搜索")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "重置" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "仅启用" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("选择：全选勾选当前页全部行，再点取消", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        selection={{ selectedIds: new Set(), onChange }}
      />,
    );
    await user.click(screen.getByRole("checkbox", { name: "全选" }));
    expect(onChange).toHaveBeenLastCalledWith(new Set(["a", "b", "c"]));

    rerender(
      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        selection={{ selectedIds: new Set(["a", "b", "c"]), onChange }}
      />,
    );
    await user.click(screen.getByRole("checkbox", { name: "全选" }));
    expect(onChange).toHaveBeenLastCalledWith(new Set());
  });

  it("分页：显示总数，首页禁用上一页，翻页回调带页码", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        pagination={{
          page: 1,
          pageSize: 20,
          total: 45,
          onPageChange,
          onPageSizeChange: vi.fn(),
        }}
      />,
    );
    expect(screen.getByText("共 45 条，第 1/3 页")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
