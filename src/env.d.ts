/// <reference types="vite/client" />

declare global {
  interface Window {
    /** Tauri 环境注入（web 模式下不存在） */
    __TAURI_INTERNALS__?: {
      invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown>;
    };
  }
}

export {};
