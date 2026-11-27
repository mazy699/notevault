/**
 * Worklog 工作台 ↔ NoteVault 宿主桥接：
 * - WlPersist：整库字节与附属文件的读写（经 wl_* 命令）
 * - AI fetch 垫片：经宿主代理发起 HTTP（规避 WebView/浏览器 CORS）
 * - 导出文件保存：桌面端弹系统对话框，Web 端浏览器下载
 */
import { api, isTauri } from "../../api/client";
import type { JiraConfigInput } from "../../../shared/types";
import type { WlPersist } from "../data/persist";
import type { JiraTransport } from "../data/sync/types";

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** WlPersist：宿主文件命令实现 */
export function createHostPersist(): WlPersist {
  return {
    async loadDb() {
      const r = await api.wlDbLoad();
      return r.b64 ? b64ToBytes(r.b64) : null;
    },
    async saveDb(bytes) {
      await api.wlDbSave(bytesToB64(bytes));
    },
    async readAux(name) {
      const r = await api.wlAuxRead(name);
      return r.text;
    },
    async writeAux(name, text) {
      await api.wlAuxWrite(name, text);
    },
    async backupDb(bytes) {
      const r = await api.wlBackup(bytesToB64(bytes));
      return r.path;
    },
    async info() {
      const r = await api.wlDataInfo();
      return { dataDir: r.dataDir, dbFile: r.dbFile };
    },
  };
}

/** Jira 宿主桥：配置与 REST 请求都由宿主处理，token 不进入前端数据层 */
export function createJiraTransport(): JiraTransport {
  return {
    getConfig: () => api.wlJiraConfigGet(),
    saveConfig: (cfg: JiraConfigInput) => api.wlJiraConfigSet(cfg),
    clearConfig: async () => {
      await api.wlJiraConfigClear();
    },
    request: (req) => api.wlJiraRequest(req),
  };
}

/** AI 请求垫片：同 sign 于 fetch，走宿主代理（90s 超时在宿主侧） */
export function makeAiFetch(): typeof fetch {
  const shim = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const headers: Record<string, string> = {};
    if (init?.headers) {
      new Headers(init.headers as HeadersInit).forEach((v, k) => {
        headers[k] = v;
      });
    }
    const body = typeof init?.body === "string" ? init.body : undefined;
    const r = await api.wlAiProxy({ url, method: init?.method ?? "POST", headers, body });
    return new Response(r.body, { status: r.status });
  };
  return shim as typeof fetch;
}

/**
 * 保存导出文本：桌面端走系统"另存为"对话框；Web 端走浏览器下载。
 * 返回给设置页展示的保存位置描述。
 */
export async function saveWorklogFile(defaultName: string, content: string): Promise<string> {
  if (isTauri()) {
    const r = await api.saveTextFile(defaultName, content);
    return r.ok ? (r.path ?? defaultName) : "已取消保存";
  }
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = defaultName;
  a.click();
  URL.revokeObjectURL(url);
  return defaultName;
}

/** 读取本地文件文本（导入用）：input[type=file] 在 WebView2 / 浏览器均原生支持 */
export function pickTextFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    // 用户取消时不会触发 change：聚焦回来再兜底（简单处理为不解析）
    window.addEventListener(
      "focus",
      () => {
        setTimeout(() => {
          if (!input.files || input.files.length === 0) resolve(null);
        }, 800);
      },
      { once: true }
    );
    input.click();
  });
}
