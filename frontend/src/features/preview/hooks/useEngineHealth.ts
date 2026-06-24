import { useEffect, useState } from "react"
import { fetchEngineHealth } from "../../../services/engine/healthApi"
import type { EngineHealth } from "../../../types/health"

export type EngineHealthState =
  | {
      readonly kind: "idle"
    }
  | {
      readonly kind: "loading"
    }
  | {
      readonly kind: "ready"
      readonly health: EngineHealth
    }
  | {
      readonly kind: "error"
      readonly message: string
    }

const POLL_INTERVAL_MS = 5000

const toErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : "引擎不可用"
}

/**
 * 按固定间隔轮询本地引擎健康状态端点，并对外暴露一个可辨识的状态。
 * 桌面外壳负责管理引擎进程的生命周期，因此该 Hook 是渲染进程
 * 获取引擎实时状态的唯一可信来源。
 */
export const useEngineHealth = (intervalMs: number = POLL_INTERVAL_MS): EngineHealthState => {
  const [state, setState] = useState<EngineHealthState>({ kind: "idle" })

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | null = null

    const tick = async (): Promise<void> => {
      try {
        const health = await fetchEngineHealth()
        if (!active) {
          return
        }
        setState({ kind: "ready", health })
      } catch (error: unknown) {
        if (!active) {
          return
        }
        setState({ kind: "error", message: toErrorMessage(error) })
      }

      if (active) {
        timer = setTimeout(() => {
          void tick()
        }, intervalMs)
      }
    }

    setState({ kind: "loading" })
    void tick()

    return () => {
      active = false
      if (timer !== null) {
        clearTimeout(timer)
      }
    }
  }, [intervalMs])

  return state
}
