/**
 * 全局密码库自动上锁（Issue #4）：
 * 解锁状态下监听用户活动（键鼠/滚动/输入），空闲超过设定分钟数后自动上锁。
 * 挂载在 App 根部，切换工作台期间同样计时。
 */
import { useEffect } from "react";
import { usePw } from "../stores/pw";
import { isIdleExpired } from "../lib/autolock";

export function usePwAutoLock(): void {
  const encrypted = usePw((s) => s.encrypted);
  const unlocked = usePw((s) => s.unlocked);
  const minutes = usePw((s) => s.autoLockMinutes);
  const lock = usePw((s) => s.lock);

  useEffect(() => {
    if (!encrypted || !unlocked) return;
    let lastActive = Date.now();
    const bump = () => {
      lastActive = Date.now();
    };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "wheel", "touchstart", "input"];
    for (const e of events) window.addEventListener(e, bump, true);
    // 每 10 秒检查一次，避免高频计时；判定阈值由 minutes 决定
    const timer = window.setInterval(() => {
      if (isIdleExpired(lastActive, Date.now(), minutes)) lock();
    }, 10_000);
    return () => {
      for (const e of events) window.removeEventListener(e, bump, true);
      window.clearInterval(timer);
    };
  }, [encrypted, unlocked, minutes, lock]);
}
