import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 5176,
    proxy: {
      // API_PORT: chay worker cong khac khi 8790 dang ban (vd 2 app cung chay local)
      "/api": { target: `http://localhost:${process.env.API_PORT ?? 8790}`, changeOrigin: true },
    },
  },
});
