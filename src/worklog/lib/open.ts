import { api } from "../../api/client";

/** 用系统浏览器打开外部链接（桌面端走宿主，Web 端回退 window.open） */
export async function openExternalUrl(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return;
  try {
    await api.openExternal(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
