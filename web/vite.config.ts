import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * 开发期把 /api、/health、/ws 代理到后端 3000 端口，
 * 前端代码里统一使用相对路径，部署时可自由选择同源部署或独立部署。
 */
const BACKEND = process.env.VITE_BACKEND_URL ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: BACKEND, changeOrigin: true },
      "/health": { target: BACKEND, changeOrigin: true },
      "/ws": { target: BACKEND, ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    // 前端体量小，暂不做分包；后续若引入图表库再开启 manualChunks
    chunkSizeWarningLimit: 800,
  },
});
