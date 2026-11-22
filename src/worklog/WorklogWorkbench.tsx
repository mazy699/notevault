/**
 * Worklog 工作台外壳（原样版）：
 * - 独立 QueryClient（与原 Worklog 的 useWeekMatrix/useTasks 缓存语义一致）
 * - DataService 初始化门（sql.js 首次进入时懒加载）
 * - .wl-root 主题作用域（与原 UI 一致，独立于 NoteVault 主题）
 */
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WorklogApp from "./WorklogApp";
import { getWorklogService } from "./session";
import "./worklog.css";
import "./worklog-unified.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

type BootState = { status: "loading" } | { status: "ready" } | { status: "error"; message: string };

export function WorklogWorkbench() {
  const [boot, setBoot] = useState<BootState>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    getWorklogService()
      .then(() => alive && setBoot({ status: "ready" }))
      .catch((e) => alive && setBoot({ status: "error", message: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="content-col wl-root">
      {boot.status === "loading" ? (
        <div className="wl-boot">
          <span className="wl-spinner" /> 正在加载工作日志数据…
        </div>
      ) : boot.status === "error" ? (
        <div className="wl-boot">
          <div className="wl-boot-err">
            <b>工作日志加载失败</b>
            <div>{boot.message}</div>
            <div className="wl-boot-hint">数据目录：%APPDATA%/worklog（可用环境变量 WORKLOG_DATA_DIR 覆盖）</div>
            <button
              className="wl-boot-retry"
              onClick={() => {
                setBoot({ status: "loading" });
                getWorklogService()
                  .then(() => setBoot({ status: "ready" }))
                  .catch((e) => setBoot({ status: "error", message: e instanceof Error ? e.message : String(e) }));
              }}
            >
              重试
            </button>
          </div>
        </div>
      ) : (
        <QueryClientProvider client={queryClient}>
          <WorklogApp />
        </QueryClientProvider>
      )}
    </div>
  );
}
