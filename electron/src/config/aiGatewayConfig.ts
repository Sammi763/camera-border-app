/**
 * 联通国际 Uni Token AI 网关静态配置。
 *
 * 文档：https://token.chinaunicomglobal.com/docs
 * 该网关统一接入多家模型厂商，五条协议共用一个 Base URL 与 API Key：
 * - OpenAI 兼容（Chat Completions / Images）
 * - Anthropic 兼容（Messages）
 * - Gemini 原生（generateContent，鉴权头为 x-goog-api-key）
 * - Seedance 视频生成任务
 *
 * 本文件只放不随运行时变化的静态常量；API Key 的读取见 ai/apiKeyStore.ts。
 * 密钥永不写入本文件或任何进 git 的代码文件。
 */

/** 网关 Base URL。 */
export const AI_GATEWAY_BASE_URL = "https://token.chinaunicomglobal.com"

/** Anthropic 协议必需的版本头（网关文档示例值）。 */
export const AI_GATEWAY_ANTHROPIC_VERSION = "2023-06-01"

/**
 * 五条协议的端点路径（与 Base URL 拼接使用）。
 * 路径以网关文档为准；Gemini 的 {modelId} 由调用方替换。
 */
export const AI_GATEWAY_ENDPOINTS = {
  /** OpenAI 兼容对话补全。 */
  openaiChatCompletions: "/v1/chat/completions",
  /** OpenAI 兼容文本生图。 */
  openaiImageGenerations: "/v1/images/generations",
  /** OpenAI 兼容图片编辑（multipart/form-data）。 */
  openaiImageEdits: "/v1/images/edits",
  /** Anthropic 兼容 Messages。 */
  anthropicMessages: "/v1/messages",
  /** Gemini 原生 generateContent，前缀（后接 {modelId}:generateContent）。 */
  geminiGenerateContentPrefix: "/v1beta/models",
  /** Seedance 视频任务创建。 */
  seedanceTasks: "/v1/contents/generations/tasks"
} as const

/**
 * 默认模型占位（V2 接入时按控制台可用模型列表改写）。
 * 留空表示未选定——调用方必须显式传 model，不静默回退，避免拿错模型产生费用。
 */
export const AI_GATEWAY_DEFAULT_MODELS = {
  openaiChat: "",
  openaiImage: "",
  anthropic: "",
  gemini: "",
  seedance: ""
} as const

/** 承载 API Key 的环境变量名（优先级最高的密钥来源）。 */
export const AI_GATEWAY_ENV_KEY = "UNI_TOKEN_API_KEY"
