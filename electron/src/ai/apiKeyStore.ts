/**
 * Uni Token API Key 的存储与读取。
 *
 * 密钥来源优先级（高到低）：
 * 1. 环境变量 AI_GATEWAY_ENV_KEY —— CI/联调场景
 * 2. 开发期本地文件 <electron 包根>/ai-gateway.local.json 的 apiKey 字段
 *    —— 已加入 .gitignore，直接编辑即可，重启后生效
 * 3. 运行时保存文件 <userData>/ai-gateway.json
 *    —— 打包版由设置页经 IPC 写入，权限 0600，随应用数据存放
 *
 * 任何来源都不回传明文密钥到渲染进程；对外只暴露 configured/source/maskedKey。
 * 密钥缺失不是错误：由调用方决定是否发起请求（发起时 fail-fast 抛 KeyMissing）。
 */
import { app } from "electron"
import fs from "node:fs"
import path from "node:path"
import { AI_GATEWAY_ENV_KEY } from "../config/aiGatewayConfig.js"

/** 开发期本地密钥文件名（相对 electron 包根，进 .gitignore）。 */
const LOCAL_KEY_FILE = "ai-gateway.local.json"

/** 运行时保存的密钥文件名（位于 userData）。 */
const USER_DATA_KEY_FILE = "ai-gateway.json"

/** 密钥来源分类。invalid 表示文件存在但解析失败（需要用户修复）。 */
export type AiGatewayKeySource = "env" | "local-file" | "user-data" | "none" | "invalid"

/** 密钥状态快照：对外只暴露脱敏信息，不暴露明文。 */
export type AiGatewayKeyStatus = {
  readonly configured: boolean
  readonly source: AiGatewayKeySource
  /** 形如 "abcd…wxyz" 的脱敏预览；未配置时为 null。 */
  readonly maskedKey: string | null
}

const readJsonFile = (filePath: string): string | null | "invalid" => {
  try {
    if (!fs.existsSync(filePath)) {
      return null
    }
    const raw = fs.readFileSync(filePath, "utf-8")
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) {
      return "invalid"
    }
    const key = (parsed as Record<string, unknown>)["apiKey"]
    if (typeof key !== "string") {
      return "invalid"
    }
    const trimmed = key.trim()
    return trimmed.length > 0 ? trimmed : null
  } catch {
    // 文件损坏或不可读：标记 invalid，让用户重填，而不是静默忽略。
    return "invalid"
  }
}

const maskKey = (key: string): string => {
  if (key.length < 12) {
    return `****（${key.length} 字符）`
  }
  return `${key.slice(0, 4)}…${key.slice(-4)}`
}

/** 开发期本地密钥文件绝对路径（electron 包根）。 */
export const getLocalKeyFilePath = (): string => path.join(app.getAppPath(), LOCAL_KEY_FILE)

/** 运行时保存密钥文件绝对路径（userData）。 */
export const getUserDataKeyFilePath = (): string => path.join(app.getPath("userData"), USER_DATA_KEY_FILE)

/**
 * 按优先级解析当前生效的 API Key。
 * 返回 null 表示所有来源均未配置；"invalid" 情况下也返回 null（状态层单独呈现）。
 */
export const resolveApiKey = (): string | null => {
  const fromEnv = process.env[AI_GATEWAY_ENV_KEY]?.trim()
  if (fromEnv) {
    return fromEnv
  }
  const fromLocalFile = readJsonFile(getLocalKeyFilePath())
  if (typeof fromLocalFile === "string" && fromLocalFile.length > 0) {
    return fromLocalFile
  }
  const fromUserData = readJsonFile(getUserDataKeyFilePath())
  if (typeof fromUserData === "string" && fromUserData.length > 0) {
    return fromUserData
  }
  return null
}

/** 读取脱敏密钥状态（供 IPC get-status 使用）。 */
export const getApiKeyStatus = (): AiGatewayKeyStatus => {
  const fromEnv = process.env[AI_GATEWAY_ENV_KEY]?.trim()
  if (fromEnv) {
    return { configured: true, source: "env", maskedKey: maskKey(fromEnv) }
  }

  const fromLocalFile = readJsonFile(getLocalKeyFilePath())
  if (fromLocalFile === "invalid") {
    return { configured: false, source: "invalid", maskedKey: null }
  }
  if (typeof fromLocalFile === "string") {
    return { configured: true, source: "local-file", maskedKey: maskKey(fromLocalFile) }
  }

  const fromUserData = readJsonFile(getUserDataKeyFilePath())
  if (fromUserData === "invalid") {
    return { configured: false, source: "invalid", maskedKey: null }
  }
  if (typeof fromUserData === "string") {
    return { configured: true, source: "user-data", maskedKey: maskKey(fromUserData) }
  }

  return { configured: false, source: "none", maskedKey: null }
}

/** 将密钥写入 userData 文件（权限 0600）。空字符串视为删除。 */
export const saveApiKeyToUserData = (apiKey: string): void => {
  const trimmed = apiKey.trim()
  const filePath = getUserDataKeyFilePath()
  if (trimmed.length === 0) {
    deleteApiKeyFromUserData()
    return
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify({ apiKey: trimmed }, null, 2) + "\n", {
    encoding: "utf-8",
    mode: 0o600
  })
}

/** 删除 userData 中的运行时密钥文件（不存在时静默返回）。 */
export const deleteApiKeyFromUserData = (): void => {
  try {
    fs.rmSync(getUserDataKeyFilePath(), { force: true })
  } catch {
    // 文件本就不存在或被占用：删除语义已达成，不抛错。
  }
}
