import { ipcMain } from "electron"
import {
  IPC_CHANNELS,
  type AiGatewayCredentialResult,
  type AiGatewayStatus
} from "../types/desktopApi.js"
import {
  deleteApiKeyFromUserData,
  getApiKeyStatus,
  saveApiKeyToUserData
} from "../ai/apiKeyStore.js"
import {
  AI_GATEWAY_BASE_URL,
  AI_GATEWAY_ENDPOINTS,
  AI_GATEWAY_DEFAULT_MODELS,
  AI_GATEWAY_ENV_KEY
} from "../config/aiGatewayConfig.js"

/** 注册读取脱敏状态、保存和删除本地密钥的 IPC。 */
export const registerAiGatewayCredentialsIpc = (): void => {
  ipcMain.handle(IPC_CHANNELS.AI_GATEWAY_GET_STATUS, (): AiGatewayStatus => {
    const { configured, source, maskedKey } = getApiKeyStatus()
    return {
      configured,
      source,
      maskedKey,
      baseUrl: AI_GATEWAY_BASE_URL,
      endpoints: AI_GATEWAY_ENDPOINTS,
      defaultModels: AI_GATEWAY_DEFAULT_MODELS,
      envKeyName: AI_GATEWAY_ENV_KEY
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.AI_GATEWAY_SAVE_API_KEY,
    (_event, apiKey: unknown): AiGatewayCredentialResult => {
      if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
        return { ok: false }
      }
      try {
        saveApiKeyToUserData(apiKey)
        return { ok: true }
      } catch {
        return { ok: false }
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.AI_GATEWAY_DELETE_API_KEY, (): AiGatewayCredentialResult => {
    try {
      deleteApiKeyFromUserData()
      return { ok: true }
    } catch {
      return { ok: false }
    }
  })
}
