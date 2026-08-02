import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";
import { sites } from "./build/sites-vite-plugin";

// macOS Seatbelt blocks FSEvents, so local previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

export default defineConfig(() => {
  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    resolve: {
      alias: {
        "@": fileURLToPath(new URL(".", import.meta.url)),
      },
    },
    plugins: [
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
      }),
      react(),
      VitePWA({
        registerType: "autoUpdate",
        manifest: {
          name: "LocalShelf",
          short_name: "LocalShelf",
          description: "Private local file viewer",
          theme_color: "#f7f9f6",
          background_color: "#f7f9f6",
          display: "standalone",
          start_url: "/",
          icons: [
            {
              src: "/pwa-icon-192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "/pwa-icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any maskable",
            },
            {
              src: "/pwa-icon.svg",
              sizes: "any",
              type: "image/svg+xml",
            },
          ],
        },
      }),
      sites(),
    ],
  };
});
