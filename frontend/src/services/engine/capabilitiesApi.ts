import type { CapabilitiesResponse, FidelityTier } from "../../types/preview"
import { fetchWithTimeout, getBaseUrl, readEngineHttpError } from "./engineClient"

export const CAPABILITIES_TIMEOUT_MS = 5000

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object"

const isCapabilitiesResponse = (value: unknown): value is CapabilitiesResponse => {
  if (!isObject(value)) return false
  if (typeof value["schemaVersion"] !== "number") return false
  if (!isObject(value["components"]) || !isObject(value["output"]) || !isObject(value["tiers"])) return false
  const tiers = value["tiers"] as Record<string, unknown>
  return (["quick-share", "standard-delivery", "high-fidelity-archive"] as FidelityTier[])
    .every((tier) => isObject(tiers[tier]) && typeof (tiers[tier] as Record<string, unknown>)["available"] === "boolean")
}

/** 读取当前进程探测到的真实能力；响应结构异常时 fail closed。 */
export const fetchCapabilities = async (
  timeoutMs: number = CAPABILITIES_TIMEOUT_MS
): Promise<CapabilitiesResponse> => {
  let response: Response
  try {
    response = await fetchWithTimeout(`${getBaseUrl()}/api/capabilities`, undefined, timeoutMs)
  } catch {
    throw new Error("能力探测失败：本地引擎不可达")
  }
  if (!response.ok) throw await readEngineHttpError(response, `能力探测失败：${response.status}`)
  const body: unknown = await response.json()
  if (!isCapabilitiesResponse(body)) throw new Error("能力探测失败：引擎返回的能力清单无效")
  return body
}
