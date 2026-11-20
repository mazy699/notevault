import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["shared/**/*.test.ts", "web/**/*.test.ts", "src/lib/**/*.test.ts"],
    environment: "node",
  },
});
