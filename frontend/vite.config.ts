import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 5176,
    proxy: {
      "/api": { target: "http://localhost:8790", changeOrigin: true },
    },
  },
});
