import path from "node:path";
import { defineConfig } from "vitest/config";

const wasmPath = path.resolve(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm");

export default defineConfig({
  plugins: [
    {
      // 单测（Node）环境：把 Vite 的 wasm ?url 资产导入解析为真实文件路径，
      // sql.js 在 Node 下用 fs 读取 locateFile 返回值。
      name: "sqljs-wasm-url-node",
      enforce: "pre",
      resolveId(id) {
        if (id === "sql.js/dist/sql-wasm.wasm?url") return "\0sqljs-wasm-url";
        return null;
      },
      load(id) {
        if (id === "\0sqljs-wasm-url") return `export default ${JSON.stringify(wasmPath)}`;
        return null;
      },
    },
  ],
  test: {
    include: ["shared/**/*.test.ts", "web/**/*.test.ts", "src/lib/**/*.test.ts", "src/worklog/**/*.test.ts"],
    environment: "node",
  },
});
