import { ipcMain } from "electron"
import fs from "node:fs"
import path from "node:path"
import { IPC_CHANNELS } from "../types/desktopApi.js"
import type {
  AiGatewayRequestPayload,
  AiGatewayRequestResult,
  AiGatewayStatus
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
import {
  chatCompletion,
  createAnthropicMessage,
  createImageGeneration,
  createVideoTask,
  editImage,
  geminiGenerateContent,
  getVideoTask
} from "../ai/aiGatewayClient.js"

/**
 * AI 网关（联通国际 Uni Token）IPC handler —— V2 AI 能力预留。
 *
 * 面向渲染进程提供四个最小能力：
 * - get-status：密钥是否已配置（只回脱敏信息，永不回明文）；
 * - save-api-key / delete-api-key：打包版用户在设置页填写密钥（写 userData）；
 * - request：统一代理七类网关调用。密钥只在主进程拼接，渲染进程拿不到。
 *
 * 设计原则（与 notifications 等现有 handler 一致）：
 * - 不向渲染进程抛异常：结果统一为 { ok, data | error }，前端按 ok 分支处理；
 * - 参数做最小校验（类型 + 必填 + 路径存在性），深层结构交由网关校验并透传错误。
 */

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

const errorResult = (error: unknown): AiGatewayRequestResult => {
  const err = error as { name?: string; message?: string; status?: number; bodyExcerpt?: string | null }
  return {
    ok: false,
    error: {
      kind: err?.name === "AiGatewayKeyMissingError" ? "key-missing" : "gateway",
      message: err?.message ?? "未知错误",
      status: typeof err?.status === "number" ? err.status : null,
      bodyExcerpt: err?.bodyExcerpt ?? null
    }
  }
}

/** 校验图片编辑入参中的本地路径：必须是存在的常规文件。 */
const isReadableFile = (value: unknown): value is string => {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    return false
  }
  try {
    return fs.statSync(value).isFile()
  } catch {
    return false
  }
}

/** 按 payload.protocol 分发到对应协议客户端。入参已过最小类型校验。 */
const dispatchGatewayRequest = async (
  payload: AiGatewayRequestPayload
): Promise<AiGatewayRequestResult> => {
  try {
    switch (payload.protocol) {
      case "openai-chat":
        return { ok: true, data: await chatCompletion(payload.params) }
      case "openai-image-generate":
        return { ok: true, data: await createImageGeneration(payload.params) }
      case "openai-image-edit":
        return { ok: true, data: await editImage(payload.params) }
      case "anthropic-message":
        return { ok: true, data: await createAnthropicMessage(payload.params) }
      case "gemini-generate":
        return {
          ok: true,
          data: await geminiGenerateContent(payload.modelId, payload.params)
        }
      case "seedance-create":
        return { ok: true, data: await createVideoTask(payload.params) }
      case "seedance-query":
        return { ok: true, data: await getVideoTask(payload.taskId) }
      default:
        return {
          ok: false,
          error: { kind: "gateway", message: "未知协议", status: null, bodyExcerpt: null }
        }
    }
  } catch (error) {
    return errorResult(error)
  }
}

/**
 * 注册 AI 网关四个 IPC handler。
 *
 * 在 registerAllIpc() 中调用一次；重复注册会抛错（ipcMain.handle 的标准行为）。
 */
export const registerAiGatewayIpc = (): void => {
  ipcMain.handle(IPC_CHANNELS.AI_GATEWAY_GET_STATUS, (): AiGatewayStatus => {
    const status = getApiKeyStatus()
    return {
      configured: status.configured,
      source: status.source,
      maskedKey: status.maskedKey,
      baseUrl: AI_GATEWAY_BASE_URL,
      endpoints: AI_GATEWAY_ENDPOINTS,
      defaultModels: AI_GATEWAY_DEFAULT_MODELS,
      envKeyName: AI_GATEWAY_ENV_KEY
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.AI_GATEWAY_SAVE_API_KEY,
    (_event, apiKey: unknown): { ok: boolean } => {
      if (!isNonEmptyString(apiKey)) {
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

  ipcMain.handle(IPC_CHANNELS.AI_GATEWAY_DELETE_API_KEY, (): { ok: boolean } => {
    try {
      deleteApiKeyFromUserData()
      return { ok: true }
    } catch {
      return { ok: false }
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.AI_GATEWAY_REQUEST,
    async (_event, payload: unknown): Promise<AiGatewayRequestResult> => {
      if (typeof payload !== "object" || payload === null) {
        return {
          ok: false,
          error: { kind: "gateway", message: "参数非法", status: null, bodyExcerpt: null }
        }
      }
      const candidate = payload as AiGatewayRequestPayload
      // 最小校验：协议名 + 关键必填字段；协议专属参数结构交给网关校验。
      switch (candidate?.protocol) {
        case "openai-chat":
        case "openai-image-generate":
        case "anthropic-message":
        case "gemini-generate":
        case "seedance-create":
          if (typeof (candidate.params as { model?: unknown })?.model !== "string") {
            return {
              ok: false,
              error: { kind: "gateway", message: "缺少 model", status: null, bodyExcerpt: null }
            }
          }
          return dispatchGatewayRequest(candidate)
        case "openai-image-edit":
          if (!isReadableFile((candidate.params as { imagePath?: unknown })?.imagePath)) {
            return {
              ok: false,
              error: {
                kind: "gateway",
                message: "imagePath 必须是存在的本地文件绝对路径",
                status: null,
                bodyExcerpt: null
              }
            }
          }
          return dispatchGatewayRequest(candidate)
        case "seedance-query":
          if (!isNonEmptyString(candidate.taskId)) {
            return {
              ok: false,
              error: { kind: "gateway", message: "缺少 taskId", status: null, bodyExcerpt: null }
            }
          }
          return dispatchGatewayRequest(candidate)
        default:
          return {
            ok: false,
            error: { kind: "gateway", message: "未知协议", status: null, bodyExcerpt: null }
          }
      }
    }
  )
}
