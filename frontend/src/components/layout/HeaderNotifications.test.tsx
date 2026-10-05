/**
 * Input: HeaderNotifications 组件、通知服务 mock
 * Output: 全局通知只读加载、已读计数与重复操作回归测试
 * Pos: 以当前合成用户验证通知读取和已读生命周期
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HeaderNotifications } from "./HeaderNotifications";
import type { Notification } from "@/types";

const mockGetList = vi.fn();
const mockGetUnreadCount = vi.fn();
const mockGenerate = vi.fn();
const mockMarkRead = vi.fn();
const mockMarkAllRead = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("@/services/notification.service", () => ({
  notificationService: {
    getList: (...args: unknown[]) => mockGetList(...args),
    getUnreadCount: (...args: unknown[]) => mockGetUnreadCount(...args),
    generate: (...args: unknown[]) => mockGenerate(...args),
    markRead: (...args: unknown[]) => mockMarkRead(...args),
    markAllRead: (...args: unknown[]) => mockMarkAllRead(...args),
  },
}));

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

// In-memory readback mirrors only this user's existing notification rows.
const useSyntheticNotifications = () => {
  const rows: Notification[] = Array.from({ length: 4 }, (_, index) => ({
    id: `synthetic-notification-${index + 1}`,
    userId: "synthetic-user",
    type: "PURCHASE_DRAFT",
    title: `合成通知 ${index + 1}`,
    isRead: index === 3,
    createdAt: `2026-10-0${index + 1}T12:00:00.000Z`,
  }));
  mockGetList.mockImplementation(async () => ({
    data: { items: structuredClone(rows) },
  }));
  mockGetUnreadCount.mockImplementation(async () => ({
    data: { count: rows.filter((row) => !row.isRead).length },
  }));
  return rows;
};

const openNotifications = async () => {
  await userEvent.click(screen.getByRole("button", { name: "通知" }));
  await screen.findByRole("button", { name: /合成通知 1/ });
};

describe("HeaderNotifications", () => {
  beforeEach(() => {
    mockGetList.mockReset();
    mockGetUnreadCount.mockReset();
    mockGenerate.mockReset();
    mockMarkRead.mockReset();
    mockMarkAllRead.mockReset();
    mockGetList.mockResolvedValue({ data: { items: [] } });
    mockGetUnreadCount.mockResolvedValue({ data: { count: 0 } });
  });

  it("挂载时只读取通知，不自动生成通知", async () => {
    render(<HeaderNotifications />);

    await waitFor(() => {
      expect(mockGetList).toHaveBeenCalledWith({ page: 1, pageSize: 50 });
      expect(mockGetUnreadCount).toHaveBeenCalledTimes(1);
    });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("单条已读失败可重试，重复点击和不同通知并发保持计数与重载一致", async () => {
    const rows = useSyntheticNotifications();
    const pending = deferred();
    mockMarkRead.mockRejectedValueOnce(new Error("Synthetic failed read"));
    mockMarkRead.mockImplementation(async (id: string) => {
      await pending.promise;
      rows.find((row) => row.id === id)!.isRead = true;
      return { data: structuredClone(rows.find((row) => row.id === id)) };
    });
    const first = render(<HeaderNotifications />);
    await openNotifications();
    expect(screen.getByText("3 条未读")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /合成通知 1/ }));
    expect(screen.getByText("3 条未读")).toBeVisible();
    expect(rows[0].isRead).toBe(false);
    await userEvent.dblClick(
      screen.getByRole("button", { name: /合成通知 1/ }),
    );
    expect(screen.getByText("3 条未读")).toBeVisible();
    await act(async () => {
      pending.resolve();
      await pending.promise;
    });
    expect(rows.filter((row) => !row.isRead)).toHaveLength(2);
    await waitFor(() => expect(screen.getByText("2 条未读")).toBeVisible());
    expect(mockMarkRead).toHaveBeenCalledTimes(2);
    expect(mockMarkRead).toHaveBeenCalledWith(rows[0].id);
    first.unmount();

    render(<HeaderNotifications />);
    await openNotifications();
    expect(screen.getByText("2 条未读")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /合成通知 1/ }));
    expect(mockMarkRead).toHaveBeenCalledTimes(2);
    expect(rows.filter((row) => !row.isRead).map((row) => row.id)).toEqual([
      rows[1].id,
      rows[2].id,
    ]);

    const second = deferred();
    const third = deferred();
    mockMarkRead.mockImplementation(async (id: string) => {
      await (id === rows[1].id ? second.promise : third.promise);
      rows.find((row) => row.id === id)!.isRead = true;
      return { data: structuredClone(rows.find((row) => row.id === id)) };
    });
    await userEvent.click(screen.getByRole("button", { name: /合成通知 2/ }));
    await userEvent.click(screen.getByRole("button", { name: /合成通知 3/ }));
    expect(mockMarkRead).toHaveBeenCalledTimes(4);
    expect(mockMarkRead).toHaveBeenNthCalledWith(3, rows[1].id);
    expect(mockMarkRead).toHaveBeenNthCalledWith(4, rows[2].id);
    await act(async () => {
      third.resolve();
      await third.promise;
    });
    expect(screen.getByText("1 条未读")).toBeVisible();
    await act(async () => {
      second.resolve();
      await second.promise;
    });
    expect(screen.queryByText(/条未读/)).not.toBeInTheDocument();
    expect(rows.every((row) => row.isRead)).toBe(true);
  });

  it("全部已读响应丢失后可重试，重复点击与重新挂载不增加通知或负计数", async () => {
    const rows = useSyntheticNotifications();
    mockMarkAllRead.mockImplementationOnce(async () => {
      rows.forEach((row) => {
        row.isRead = true;
      });
      throw new Error("Synthetic lost response");
    });
    const pending = deferred();
    mockMarkAllRead.mockImplementation(async () => {
      await pending.promise;
      rows.forEach((row) => {
        row.isRead = true;
      });
      return { data: null };
    });
    const first = render(<HeaderNotifications />);
    await openNotifications();
    await userEvent.click(screen.getByRole("button", { name: "全部已读" }));
    expect(screen.getByText("3 条未读")).toBeVisible();
    await userEvent.dblClick(screen.getByRole("button", { name: "全部已读" }));
    await act(async () => {
      pending.resolve();
      await pending.promise;
    });
    await waitFor(() =>
      expect(screen.queryByText(/条未读/)).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "全部已读" }),
    ).not.toBeInTheDocument();
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.isRead)).toBe(true);
    first.unmount();

    render(<HeaderNotifications />);
    await openNotifications();
    expect(screen.queryByText(/条未读/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "全部已读" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /合成通知/ })).toHaveLength(4);
  });
});
