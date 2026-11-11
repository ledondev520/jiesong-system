/**
 * Input: Vitest运行时、Testing Library
 * Output: 前端测试全局初始化
 * Pos: 前端测试基础设施入口
 */

import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { resetExpiredAuthSessionForTest } from "@/lib/auth-session";

// next/font/local 依赖 Next 的编译期转换，vitest 里没有；返回等价的稳定类名即可。
vi.mock("next/font/local", () => ({
  default: () => ({
    className: "mock-font",
    variable: "mock-font-var",
    style: {},
  }),
}));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver =
    ResizeObserverMock as unknown as typeof ResizeObserver;
}

if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = () => false;
}

if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = () => {};
}

if (!HTMLElement.prototype.releasePointerCapture) {
  HTMLElement.prototype.releasePointerCapture = () => {};
}

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {};
}

afterEach(() => {
  resetExpiredAuthSessionForTest();
  cleanup();
});
