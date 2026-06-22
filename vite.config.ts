import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";

// Frontend dev server proxies /api to the local Node backend (LLM proxy + edge-tts)
// and /asr to the local speech server. Proxying /asr (rather than the browser
// hitting 127.0.0.1:8799 directly) is what lets voice work when the app is opened
// from another device over a Tailscale/HTTPS link.
export default defineConfig({
  plugins: [react(), tailwind()],
  server: {
    port: 5180,
    host: true, // listen on all interfaces so a phone on the tailnet/LAN can reach it
    allowedHosts: true, // accept the Tailscale *.ts.net host header
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      "/asr": {
        target: "http://127.0.0.1:8799",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/asr/, ""),
      },
    },
  },
  // @huggingface/transformers ships large wasm; keep it out of the optimize step
  // so the worker can load the ONNX runtime on demand.
  optimizeDeps: {
    exclude: ["@huggingface/transformers"],
  },
  worker: {
    format: "es",
  },
});
