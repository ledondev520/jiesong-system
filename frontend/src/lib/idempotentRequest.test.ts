/**
 * Idempotent Request 单元测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash, webcrypto } from "node:crypto";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
import { advanceAuthGeneration } from "./browser-session";
import { runIdempotentRequest, buildIdempotencyKey } from "./idempotentRequest";

describe("idempotentRequest", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("应该成功执行请求", async () => {
    const runner = vi.fn().mockResolvedValue("success");

    const result = await runIdempotentRequest("key-1", runner);

    expect(result).toBe("success");
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("应该缓存相同键的请求", async () => {
    const runner = vi.fn().mockResolvedValue("cached");

    const promise1 = runIdempotentRequest("key-2", runner);
    const promise2 = runIdempotentRequest("key-2", runner);

    const [result1, result2] = await Promise.all([promise1, promise2]);

    expect(result1).toBe("cached");
    expect(result2).toBe("cached");
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("应该在错误后清除缓存", async () => {
    const runner = vi.fn().mockRejectedValue(new Error("failed"));

    await expect(runIdempotentRequest("key-3", runner)).rejects.toThrow(
      "failed",
    );

    // 错误后应该可以重新执行
    const newRunner = vi.fn().mockResolvedValue("retry-success");
    const result = await runIdempotentRequest("key-3", newRunner);

    expect(result).toBe("retry-success");
    expect(newRunner).toHaveBeenCalledTimes(1);
  });

  it("应该使用缓存值当未过期", async () => {
    const runner = vi.fn().mockResolvedValue("fresh");

    // 第一次请求
    await runIdempotentRequest("key-4", runner, { ttlMs: 5000 });

    // 在同一窗口期内再次请求
    const newRunner = vi.fn().mockResolvedValue("new-value");
    const result = await runIdempotentRequest("key-4", newRunner, {
      ttlMs: 5000,
    });

    // 应该返回缓存值，而不是执行新runner
    expect(result).toBe("fresh");
    expect(newRunner).not.toHaveBeenCalled();
  });

  it("应该在过期后重新执行", async () => {
    const runner = vi.fn().mockResolvedValue("expired");

    // 第一次请求
    await runIdempotentRequest("key-5", runner, { ttlMs: 1000 });

    // 等待过期
    vi.advanceTimersByTime(1500);

    // 再次请求
    const newRunner = vi.fn().mockResolvedValue("new-value");
    const result = await runIdempotentRequest("key-5", newRunner, {
      ttlMs: 1000,
    });

    expect(result).toBe("new-value");
    expect(newRunner).toHaveBeenCalledTimes(1);
  });
  it("新会话不会共享或命中旧会话的业务提交结果", async () => {
    let finish!: (value: string) => void;
    const old = runIdempotentRequest(
      "same-payload",
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    advanceAuthGeneration();
    const runner = vi.fn().mockResolvedValue("current-owner");
    expect(await runIdempotentRequest("same-payload", runner)).toBe(
      "current-owner",
    );
    finish("old-owner");
    await old;
    expect(await runIdempotentRequest("same-payload", runner)).toBe(
      "current-owner",
    );
    expect(runner).toHaveBeenCalledOnce();
  });
});

describe("buildIdempotencyKey", () => {
  beforeEach(() => vi.stubGlobal("crypto", webcrypto));

  it("reproduces the raw-Unicode header failure and accepts the bounded SHA-256 key", async () => {
    const payload = { amount: 22.6, note: "内部测试付款，仅合成数据 🚚" };
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/synthetic-payments");
    expect(() =>
      xhr.setRequestHeader(
        "X-Idempotency-Key",
        `idempotency:${JSON.stringify(payload)}`,
      ),
    ).toThrow(/ByteString/);
    const key = await buildIdempotencyKey(payload);
    expect(key).toMatch(/^idempotency:sha256:[a-f0-9]{64}$/);
    expect(key.length).toBe(83);
    expect(() => xhr.setRequestHeader("X-Idempotency-Key", key)).not.toThrow();
    expect(key).not.toContain(payload.note);
    expect(key).toBe(
      `idempotency:sha256:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`,
    );
  });

  it("sorts nested object keys but preserves array order and JSON date semantics", async () => {
    expect(await buildIdempotencyKey({ b: { z: 2, a: 1 }, a: [1, 2] })).toBe(
      await buildIdempotencyKey({ a: [1, 2], b: { a: 1, z: 2 } }),
    );
    expect(await buildIdempotencyKey([1, 2])).not.toBe(
      await buildIdempotencyKey([2, 1]),
    );
    expect(
      await buildIdempotencyKey({
        date: new Date("2026-10-01"),
        absent: undefined,
      }),
    ).toBe(await buildIdempotencyKey({ date: "2026-10-01T00:00:00.000Z" }));
    expect(await buildIdempotencyKey('{"a":1}')).not.toBe(
      await buildIdempotencyKey({ a: 1 }),
    );
  });

  it("hashes every byte of long notes without truncation or collapsing distinct payloads", async () => {
    const prefix = "合成测试备注".repeat(2000);
    const a = { amount: 22.6, note: `${prefix}甲` };
    const b = { amount: 22.6, note: `${prefix}乙` };
    expect(await buildIdempotencyKey(a)).toBe(
      await buildIdempotencyKey({ ...a }),
    );
    expect(await buildIdempotencyKey(a)).not.toBe(await buildIdempotencyKey(b));
    expect((await buildIdempotencyKey(b)).length).toBe(83);
  });

  it("fails closed for unsupported crypto or unserializable input", async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await expect(buildIdempotencyKey(circular)).rejects.toThrow();
    await expect(buildIdempotencyKey(undefined)).rejects.toThrow();
    vi.stubGlobal("crypto", {});
    await expect(buildIdempotencyKey({ note: "测试" })).rejects.toThrow(
      /HTTPS/,
    );
  });
});
