import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const API_PORT = 8321;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    proxy: {
      "/api": `http://127.0.0.1:${API_PORT}`,
      "/vault": `http://127.0.0.1:${API_PORT}`,
      "/raw": `http://127.0.0.1:${API_PORT}`,
    },
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 4000,
  },
});
