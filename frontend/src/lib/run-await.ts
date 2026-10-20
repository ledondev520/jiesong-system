/**
 * Input: 请求函数 + 成功/失败/收尾回调
 * Output: 与 `async () => { try { onValue(await fn()) } catch (e) { onError(e) } finally { onFinally() } }`
 *         时序完全一致的 Promise（各回调执行的微任务位置、返回 Promise 的完成时机、同步异常与回调异常的处理均相同）
 * Pos: 供页面在 effect 中调用的请求函数使用：状态只在回调中写入（满足 react-hooks/set-state-in-effect），
 *      又不像 `.then().catch().finally()` 链那样改变同一轮内多个请求成功/失败处理的相对顺序
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const noop = () => {};

export function runAwait<T>(
  fn: () => T | PromiseLike<T>,
  onValue: (value: T) => void,
  onError: (error: unknown) => void,
  onFinally: () => void = noop,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // 对应 try 块结束后的 catch/finally：body 抛错时先执行 finally 再以该错误结束；finally 抛错时以 finally 的错误结束
    const complete = (body: () => void) => {
      let failed = false;
      let failure: unknown;
      try {
        body();
      } catch (error) {
        failed = true;
        failure = error;
      }
      try {
        onFinally();
      } catch (error) {
        reject(error);
        return;
      }
      if (failed) reject(failure);
      else resolve();
    };
    const handleValue = (value: T) =>
      complete(() => {
        try {
          onValue(value);
        } catch (error) {
          onError(error);
        }
      });
    let pending: T | PromiseLike<T>;
    try {
      pending = fn();
    } catch (error) {
      // 原 async 函数中 `await fn()` 之前同步抛出的异常在调用当下即进入 catch/finally
      complete(() => onError(error));
      return;
    }
    // 与 `await pending` 相同：原生 Promise 直接在其上注册回调，不额外增加微任务
    Promise.resolve(pending).then(handleValue, (error: unknown) =>
      complete(() => onError(error)),
    );
  });
}
