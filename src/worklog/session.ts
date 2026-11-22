/**
 * Worklog 工作台会话：DataService 单例初始化（sql.js 懒加载 + 宿主持久化）。
 * 首次进入工作台时初始化；失败可重试。
 */
import { DataService } from "./data";
import { createHostPersist, makeAiFetch } from "./api/host";

let servicePromise: Promise<DataService> | null = null;

async function create(): Promise<DataService> {
  const svc = new DataService();
  svc.setFetchImpl(makeAiFetch());
  await svc.init(createHostPersist());
  return svc;
}

export function getWorklogService(): Promise<DataService> {
  if (!servicePromise) {
    servicePromise = create().catch((e) => {
      servicePromise = null;
      throw e;
    });
  }
  return servicePromise;
}

/** 测试/切换数据目录后重置（当前未使用，保留） */
export function resetWorklogService(): void {
  servicePromise = null;
}
