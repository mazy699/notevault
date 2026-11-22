/// <reference types="vite/client" />

export {};

declare global {
  interface Window {
    api: {
      invoke: (channel: string, payload?: unknown) => Promise<unknown>;
      smokeReport: (report: unknown) => void;
    };
  }
}
