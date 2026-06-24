import type { EngineHealth } from "../../types/health"
import { getBaseUrl } from "./engineClient"

export const fetchEngineHealth = async (): Promise<EngineHealth> => {
  const response = await fetch(`${getBaseUrl()}/api/health`)

  if (!response.ok) {
    throw new Error(`引擎健康检查失败：${response.status}`)
  }

  const data = (await response.json()) as EngineHealth
  return data
}
