/**
 * Input: none
 * Output: start() → isCurrent(); only the newest request (and only while mounted) may write response-driven state
 * Pos: 列表加载共用的“迟到响应丢弃”守卫（评审 R1-4）
 */
import { useCallback, useEffect, useRef } from "react";

export function useLatestRequest() {
  const latest = useRef(0);
  useEffect(
    () => () => {
      latest.current += 1;
    },
    [],
  );
  return useCallback(() => {
    const mine = ++latest.current;
    return () => mine === latest.current;
  }, []);
}
