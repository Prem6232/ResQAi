/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "SENTINELGRID",
        short_name: "SentinelGrid",
        description:
          "Campus emergency reporting and coordination prototype. Not a certified dispatch system.",
        theme_color: "#111827",
        background_color: "#F6F4EF",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
          { src: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 3000,
    host: "0.0.0.0",
    allowedHosts: true,
    hmr: process.env.DISABLE_HMR !== "true",
    watch: process.env.DISABLE_HMR === "true" ? null : {},
    proxy: {
      "/api/v1": {
        target: "https://resqai-api.onrender.com",
        changeOrigin: true,
        headers: {
          Origin: "https://res-q-ai-coral.vercel.app",
        },
      },
      "/ws": {
        target: "wss://resqai-api.onrender.com",
        ws: true,
        changeOrigin: true,
        headers: {
          Origin: "https://res-q-ai-coral.vercel.app",
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
