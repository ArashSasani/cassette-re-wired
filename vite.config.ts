import { defineConfig } from "vite";

export default defineConfig({
  root: "src/renderer",
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/runs": "http://127.0.0.1:4310",
      "/preflight": "http://127.0.0.1:4310",
    },
  },
});
