/**
 * 联通国际 Uni Token 网关五条协议的请求/响应类型。
 *
 * 字段对齐网关文档（https://token.chinaunicomglobal.com/docs）的最小必需集，
 * 额外参数通过各自的 `parameters` / 扩展字段透传，避免类型频繁追改。
 * 响应体按网关文档示例建模；网关转发厂商响应，未知字段一律允许。
 */

// ---------- OpenAI 兼容：Chat Completions ----------

/** OpenAI 兼容对话消息。content 支持纯文本或多模态分段（文本/图片 URL）。 */
export type OpenAiChatMessage = {
  role: "system" | "user" | "assistant" | "tool"
  content:
    | string
    | readonly { type: "text"; text: string }[]
    | readonly { type: "image_url"; image_url: { url: string } }[]
}

export type OpenAiChatRequest = {
  model: string
  messages: readonly OpenAiChatMessage[]
  /** 是否流式响应；网关支持 SSE。 */
  stream?: boolean
  temperature?: number
  max_tokens?: number
  /** 函数调用工具列表（预留，结构按 OpenAI 原样透传）。 */
  tools?: readonly unknown[]
}

export type OpenAiChatResponse = {
  id?: string
  object?: string
  model?: string
  choices?: readonly {
    index?: number
    message?: { role?: string; content?: string | null }
    finish_reason?: string
  }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}

// ---------- OpenAI 兼容：Images ----------

export type OpenAiImageGenerationRequest = {
  model: string
  prompt: string
  /** 扩展参数（n、size、quality、response_format 等）按网关文档透传。 */
  parameters?: Record<string, unknown>
}

export type OpenAiImageResponse = {
  code?: number
  data?: readonly { url?: string; b64_json?: string }[]
  usage?: { image_count?: number; input_tokens?: number; output_tokens?: number }
}

// ---------- Anthropic 兼容：Messages ----------

export type AnthropicMessageRequest = {
  model: string
  messages: readonly {
    role: "user" | "assistant"
    content:
      | string
      | readonly (
          | { type: "text"; text: string }
          | { type: "image"; source: { type: "url"; url: string } }
        )[]
  }[]
  /** Anthropic 协议中 max_tokens 为必填。 */
  max_tokens: number
  system?: string
  stream?: boolean
  temperature?: number
  tools?: readonly unknown[]
}

export type AnthropicMessageResponse = {
  id?: string
  type?: string
  role?: string
  content?: readonly { type?: string; text?: string }[]
  model?: string
  stop_reason?: string
  usage?: { input_tokens?: number; output_tokens?: number }
}

// ---------- Gemini 原生：generateContent ----------

export type GeminiGenerateRequest = {
  contents: readonly {
    role?: "user" | "model"
    parts: readonly ({ text: string } | { inline_data: { mime_type: string; data: string } })[]
  }[]
  generationConfig?: {
    maxOutputTokens?: number
    temperature?: number
    topP?: number
  }
  systemInstruction?: { parts: readonly { text: string }[] } | string
}

export type GeminiGenerateResponse = {
  candidates?: readonly {
    content?: { role?: string; parts?: readonly { text?: string }[] }
    finishReason?: string
  }[]
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  }
}

// ---------- Seedance 视频任务 ----------

export type SeedanceCreateTaskRequest = {
  model: string
  prompt: string
  parameters?: {
    aspect_ratio?: string
    duration?: number
    resolution?: string
    [key: string]: unknown
  }
}

export type SeedanceTaskResponse = {
  id?: string
  status?: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED"
  created_at?: number
  /** 任务完成后网关返回的代理视频地址。 */
  video_url?: string
  error?: { message?: string }
}

// ---------- 统一错误 ----------

/** 网关调用错误：status 为 HTTP 状态码，bodyExcerpt 为响应体截断片段。 */
export class AiGatewayError extends Error {
  readonly status: number | null
  readonly bodyExcerpt: string | null

  constructor(message: string, status: number | null = null, bodyExcerpt: string | null = null) {
    super(message)
    this.name = "AiGatewayError"
    this.status = status
    this.bodyExcerpt = bodyExcerpt
  }
}

/** API Key 未配置时抛出——失败关闭，不用空密钥发请求。 */
export class AiGatewayKeyMissingError extends AiGatewayError {
  constructor() {
    super("Uni Token API Key 未配置：请设置环境变量、填写 ai-gateway.local.json 或在设置中保存密钥")
    this.name = "AiGatewayKeyMissingError"
  }
}
