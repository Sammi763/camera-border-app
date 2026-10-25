/**
 * Uni Token 网关客户端：五条协议的请求封装（主进程专用）。
 *
 * - 鉴权统一从 apiKeyStore 解析；Gemini 协议按官方习惯用 x-goog-api-key，
 *   其余协议用 Authorization: Bearer（以网关文档为准）。
 * - 未配置密钥时 fail-fast 抛 AiGatewayKeyMissingError，不发空请求。
 * - 非 2xx 统一抛 AiGatewayError，携带状态码与响应体截断，便于排障。
 * - 超时默认 120 秒（视频任务创建可能较慢；查询任务不限制流式）。
 */
import { AI_GATEWAY_BASE_URL, AI_GATEWAY_ANTHROPIC_VERSION, AI_GATEWAY_ENDPOINTS } from "../config/aiGatewayConfig.js"
import { resolveApiKey } from "./apiKeyStore.js"
import {
  AiGatewayError,
  AiGatewayKeyMissingError,
  type AnthropicMessageRequest,
  type AnthropicMessageResponse,
  type GeminiGenerateRequest,
  type GeminiGenerateResponse,
  type OpenAiChatRequest,
  type OpenAiChatResponse,
  type OpenAiImageGenerationRequest,
  type OpenAiImageResponse,
  type SeedanceCreateTaskRequest,
  type SeedanceTaskResponse
} from "./aiGatewayTypes.js"

const DEFAULT_TIMEOUT_MS = 120_000

const assertApiKey = (): string => {
  const key = resolveApiKey()
  if (!key) {
    throw new AiGatewayKeyMissingError()
  }
  return key
}

const excerptBody = (body: string): string => (body.length > 500 ? `${body.slice(0, 500)}…` : body)

/** 统一 JSON POST：拼 URL、带鉴权头、超时控制、非 2xx 抛错。 */
const postJson = async (
  endpointPath: string,
  headers: Record<string, string>,
  payload: unknown,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<unknown> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${AI_GATEWAY_BASE_URL}${endpointPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(payload),
      signal: controller.signal
    })
    const text = await response.text()
    if (!response.ok) {
      throw new AiGatewayError(
        `网关请求失败（HTTP ${response.status}）：${endpointPath}`,
        response.status,
        excerptBody(text)
      )
    }
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new AiGatewayError("网关返回了非 JSON 响应", response.status, excerptBody(text))
    }
  } finally {
    clearTimeout(timer)
  }
}

// ---------- OpenAI 兼容：Chat Completions ----------

export const chatCompletion = async (request: OpenAiChatRequest): Promise<OpenAiChatResponse> => {
  const key = assertApiKey()
  return (await postJson(AI_GATEWAY_ENDPOINTS.openaiChatCompletions, {
    Authorization: `Bearer ${key}`
  }, request)) as OpenAiChatResponse
}

// ---------- OpenAI 兼容：Images ----------

export const createImageGeneration = async (
  request: OpenAiImageGenerationRequest
): Promise<OpenAiImageResponse> => {
  const key = assertApiKey()
  return (await postJson(AI_GATEWAY_ENDPOINTS.openaiImageGenerations, {
    Authorization: `Bearer ${key}`
  }, request)) as OpenAiImageResponse
}

/** 图片编辑入参：本地图片绝对路径（主进程读取，路径不出主进程边界由 IPC 层保证）。 */
export type ImageEditParams = OpenAiImageGenerationRequest & {
  /** 待编辑图片的本地绝对路径（png/jpg/webp，以网关支持为准）。 */
  imagePath: string
}

/**
 * OpenAI 兼容图片编辑：multipart/form-data 上传本地图片 + prompt。
 * 文件读取发生在主进程；读取失败抛 AiGatewayError。
 */
export const editImage = async (params: ImageEditParams): Promise<OpenAiImageResponse> => {
  const key = assertApiKey()
  const { imagePath, model, prompt, parameters } = params

  let imageBuffer: Buffer
  try {
    imageBuffer = await import("node:fs/promises").then((fs) => fs.readFile(imagePath))
  } catch (error) {
    throw new AiGatewayError(`无法读取待编辑图片：${imagePath}`, null, String(error))
  }

  const form = new FormData()
  const mime = imagePath.toLowerCase().endsWith(".png")
    ? "image/png"
    : imagePath.toLowerCase().endsWith(".webp")
      ? "image/webp"
      : "image/jpeg"
  form.append("image", new Blob([new Uint8Array(imageBuffer)], { type: mime }), imagePath.split("/").pop() ?? "image")
  form.append("prompt", prompt)
  form.append("model", model)
  if (parameters) {
    for (const [name, value] of Object.entries(parameters)) {
      form.append(name, String(value))
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    const response = await fetch(`${AI_GATEWAY_BASE_URL}${AI_GATEWAY_ENDPOINTS.openaiImageEdits}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: controller.signal
    })
    const text = await response.text()
    if (!response.ok) {
      throw new AiGatewayError(
        `图片编辑请求失败（HTTP ${response.status}）`,
        response.status,
        excerptBody(text)
      )
    }
    return JSON.parse(text) as OpenAiImageResponse
  } finally {
    clearTimeout(timer)
  }
}

// ---------- Anthropic 兼容：Messages ----------

export const createAnthropicMessage = async (
  request: AnthropicMessageRequest
): Promise<AnthropicMessageResponse> => {
  const key = assertApiKey()
  return (await postJson(AI_GATEWAY_ENDPOINTS.anthropicMessages, {
    Authorization: `Bearer ${key}`,
    "anthropic-version": AI_GATEWAY_ANTHROPIC_VERSION
  }, request)) as AnthropicMessageResponse
}

// ---------- Gemini 原生：generateContent ----------

export const geminiGenerateContent = async (
  modelId: string,
  request: GeminiGenerateRequest
): Promise<GeminiGenerateResponse> => {
  const key = assertApiKey()
  const endpoint = `${AI_GATEWAY_ENDPOINTS.geminiGenerateContentPrefix}/${encodeURIComponent(modelId)}:generateContent`
  // Gemini 协议按官方习惯以 x-goog-api-key 携带密钥（网关文档明确此方式）。
  return (await postJson(endpoint, { "x-goog-api-key": key }, request)) as GeminiGenerateResponse
}

// ---------- Seedance 视频：创建 + 查询 ----------

export const createVideoTask = async (request: SeedanceCreateTaskRequest): Promise<SeedanceTaskResponse> => {
  const key = assertApiKey()
  return (await postJson(AI_GATEWAY_ENDPOINTS.seedanceTasks, {
    Authorization: `Bearer ${key}`
  }, request)) as SeedanceTaskResponse
}

export const getVideoTask = async (taskId: string): Promise<SeedanceTaskResponse> => {
  const key = assertApiKey()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    const response = await fetch(
      `${AI_GATEWAY_BASE_URL}${AI_GATEWAY_ENDPOINTS.seedanceTasks}/${encodeURIComponent(taskId)}`,
      { method: "GET", headers: { Authorization: `Bearer ${key}` }, signal: controller.signal }
    )
    const text = await response.text()
    if (!response.ok) {
      throw new AiGatewayError(`视频任务查询失败（HTTP ${response.status}）`, response.status, excerptBody(text))
    }
    return JSON.parse(text) as SeedanceTaskResponse
  } finally {
    clearTimeout(timer)
  }
}
