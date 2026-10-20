/**
 * Input: runAwait 与等价原生 async try/await/catch/finally 实现
 * Output: 成功/失败/同步抛错/非 Promise 返回/thenable/回调抛错各情形下微任务轨迹与结果完全一致的测试
 * Pos: 前端请求回调时序工具单测
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, expect, it } from "vitest";
import { runAwait } from "./run-await";

type Mode = "resolve" | "reject" | "syncThrow" | "plain" | "thenable";
type Fault = "none" | "onValue" | "onError" | "onFinally" | "onValueAndError";

async function trace(useHelper: boolean, mode: Mode, fault: Fault) {
  const log: string[] = [];
  const fn = () => {
    log.push("fn");
    if (mode === "syncThrow") throw new Error("sync");
    if (mode === "plain") return "plain";
    if (mode === "thenable")
      return {
        then: (ok: (v: string) => void) => ok("thenable"),
      } as PromiseLike<string>;
    return mode === "resolve"
      ? Promise.resolve("ok")
      : Promise.reject(new Error("async"));
  };
  const onValue = (v: string) => {
    log.push("value:" + v);
    if (fault === "onValue" || fault === "onValueAndError")
      throw new Error("value-fault");
  };
  const onError = (e: unknown) => {
    log.push("error:" + (e as Error).message);
    if (fault === "onError" || fault === "onValueAndError")
      throw new Error("error-fault");
  };
  const onFinally = () => {
    log.push("finally");
    if (fault === "onFinally") throw new Error("finally-fault");
  };
  const original = async () => {
    try {
      onValue(await fn());
    } catch (e) {
      onError(e);
    } finally {
      onFinally();
    }
  };
  // 并行的计时器 Promise 链，用于记录每个回调落在第几个微任务
  let tick = 0;
  let running = true;
  const ticker = (async () => {
    while (running && tick < 20) {
      await null;
      tick += 1;
      log.push("t" + tick);
    }
  })();
  log.push("call");
  const p = useHelper ? runAwait(fn, onValue, onError, onFinally) : original();
  log.push("returned");
  let outcome = "";
  await p.then(
    () => {
      outcome = "resolved";
      log.push("settled");
    },
    (e: Error) => {
      outcome = "rejected:" + e.message;
      log.push("settled");
    },
  );
  running = false;
  await ticker;
  return {
    log: log.filter(
      (x, i, a) =>
        !(x.startsWith("t") && a.slice(i + 1).every((y) => y.startsWith("t"))),
    ),
    outcome,
  };
}

describe("runAwait 与原生 async try/await 时序一致", () => {
  const modes: Mode[] = ["resolve", "reject", "syncThrow", "plain", "thenable"];
  const faults: Fault[] = [
    "none",
    "onValue",
    "onError",
    "onFinally",
    "onValueAndError",
  ];
  for (const mode of modes)
    for (const fault of faults)
      it(`${mode} / 回调异常=${fault}`, async () => {
        const expected = await trace(false, mode, fault);
        const actual = await trace(true, mode, fault);
        expect(actual).toEqual(expected);
      });

  it("同一轮内旧请求失败、新请求成功时处理顺序与 await 相同", async () => {
    const run = async (useHelper: boolean) => {
      const order: string[] = [];
      let rejectOld!: (e: unknown) => void;
      let resolveNew!: (v: string) => void;
      const oldP = new Promise<string>((_, rej) => {
        rejectOld = rej;
      });
      const newP = new Promise<string>((res) => {
        resolveNew = res;
      });
      const start = (p: Promise<string>, name: string) =>
        useHelper
          ? runAwait(
              () => p,
              () => order.push(name + ":ok"),
              () => order.push(name + ":err"),
              () => order.push(name + ":fin"),
            )
          : (async () => {
              try {
                await p;
                order.push(name + ":ok");
              } catch {
                order.push(name + ":err");
              } finally {
                order.push(name + ":fin");
              }
            })();
      const all = Promise.all([start(oldP, "old"), start(newP, "new")]);
      rejectOld(new Error("404"));
      resolveNew("B");
      await all;
      return order;
    };
    expect(await run(true)).toEqual(await run(false));
    expect(await run(true)).toEqual([
      "old:err",
      "old:fin",
      "new:ok",
      "new:fin",
    ]);
  });
});
