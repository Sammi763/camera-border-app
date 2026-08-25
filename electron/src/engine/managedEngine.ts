import type { JavaBridge } from "./JavaBridge.js"
import type { EngineConfig } from "./engineConfig.js"

/**
 * 托管引擎单例。
 *
 * appLifecycle 在启动时创建并持有；诊断与重试 IPC 由此读取，
 * 避免把 bridge 实例在模块间传来传去。
 */
let currentBridge: JavaBridge | null = null
let currentConfig: EngineConfig | null = null

export const setManagedEngine = (bridge: JavaBridge, config: EngineConfig): void => {
  currentBridge = bridge
  currentConfig = config
}

export const getManagedEngine = (): { readonly bridge: JavaBridge; readonly config: EngineConfig } | null => {
  if (currentBridge === null || currentConfig === null) {
    return null
  }
  return { bridge: currentBridge, config: currentConfig }
}
