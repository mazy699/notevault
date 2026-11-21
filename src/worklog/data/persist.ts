/**
 * Worklog 数据持久化适配层。
 * 原 Electron 版由主进程 fs 直接读写 worklog.db；接入 NoteVault 后，
 * sql.js 运行在前端（WebView/浏览器），文件读写通过宿主命令（wl_*）完成。
 * 该接口是数据层与宿主之间的唯一边界，便于单测注入内存实现。
 */
export interface WlPersist {
  /** 读取整库字节；不存在返回 null（首次使用） */
  loadDb(): Promise<Uint8Array | null>;
  /** 整库写盘（宿主负责原子写与目录创建） */
  saveDb(bytes: Uint8Array): Promise<void>;
  /** 读取附属文本文件（如 ai.json）；不存在返回 null */
  readAux(name: string): Promise<string | null>;
  /** 写入附属文本文件 */
  writeAux(name: string, text: string): Promise<void>;
  /** 把当前字节另存为备份（宿主负责时间戳命名与保留 10 份轮转），返回备份路径 */
  backupDb(bytes: Uint8Array): Promise<string>;
  /** 数据目录信息（设置页展示） */
  info(): Promise<{ dataDir: string; dbFile: string }>;
}

/** 内存实现：单元测试与演示环境用 */
export function memoryPersist(initial?: Uint8Array): WlPersist & { bytes: () => Uint8Array | null } {
  let db: Uint8Array | null = initial ?? null;
  const aux = new Map<string, string>();
  let backups = 0;
  return {
    async loadDb() {
      return db;
    },
    async saveDb(bytes) {
      db = bytes;
    },
    async readAux(name) {
      return aux.get(name) ?? null;
    },
    async writeAux(name, text) {
      aux.set(name, text);
    },
    async backupDb(bytes) {
      backups++;
      db = bytes;
      return `/memory/backups/worklog-${backups}.db`;
    },
    async info() {
      return { dataDir: "/memory", dbFile: "/memory/worklog.db" };
    },
    bytes() {
      return db;
    },
  };
}
