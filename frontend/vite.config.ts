import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import { parsePort } from "./vitePort"

const DEFAULT_FRONTEND_PORT = 5174
const DEFAULT_ENGINE_PORT = 8099

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const frontendPort = parsePort(
    process.env["CAMBORDER_FRONTEND_PORT"] ?? env["CAMBORDER_FRONTEND_PORT"],
    DEFAULT_FRONTEND_PORT
  )
  const enginePort = parsePort(
    process.env["CAMBORDER_ENGINE_PORT"] ?? env["CAMBORDER_ENGINE_PORT"],
    DEFAULT_ENGINE_PORT
  )
  const engineUrl = `http://127.0.0.1:${enginePort}`

  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: frontendPort,
      strictPort: true,
      proxy: {
        "/api": {
          target: engineUrl,
          changeOrigin: true
        },
        "/previews": {
          target: engineUrl,
          changeOrigin: true
        }
      }
    },
    preview: {
      port: 4174
    }
  }
})
