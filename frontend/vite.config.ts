import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

const ENGINE_URL = "http://127.0.0.1:8080"

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: ENGINE_URL,
        changeOrigin: true
      },
      "/previews": {
        target: ENGINE_URL,
        changeOrigin: true
      }
    }
  },
  preview: {
    port: 4173
  }
})
