/**
 * 工作台引擎调参调度器。
 *
 * 每个视图只保留一个正在请求的操作和一份最新待提交快照：
 * - 连续调参时最多每 250ms 提交一次（leading + trailing）；
 * - 松手/失焦/确认输入调用 flush()，立即提交最终快照；
 * - 相同快照不重复提交；
 * - 新快照产生新代次，通过 onSupersede 取消后端旧代次任务；
 * - dispose() 中止当前请求、清除计时器并返回最后代次，供 DELETE /api/film-requests 使用。
 *
 * 调度器只负责时序和去重，不构造 RenderRecipe，也不直接改 React 状态。
 */

export type ScheduleResult = "scheduled" | "duplicate" | "disposed"

type Pending = {
  key: string
  start: (generation: number, signal: AbortSignal) => Promise<void>
  immediate: boolean
}

type InFlight = {
  key: string
  generation: number
  controller: AbortController
}

export type TuningSchedulerOptions = {
  readonly throttleMs?: number
  readonly onSupersede?: (generation: number) => void
  readonly now?: () => number
  readonly setTimeout?: (handler: () => void, timeout: number) => number
  readonly clearTimeout?: (handle: number) => void
}

const DEFAULT_THROTTLE_MS = 250

export class TuningScheduler {
  private readonly throttleMs: number
  private readonly onSupersede: ((generation: number) => void) | undefined
  private readonly now: () => number
  private readonly setTimeoutImpl: (handler: () => void, timeout: number) => number
  private readonly clearTimeoutImpl: (handle: number) => void

  private timer: number | null = null
  private pending: Pending | null = null
  private inFlight: InFlight | null = null
  private lastCompletedKey: string | null = null
  private lastFailedKey: string | null = null
  private lastStartAt = Number.NEGATIVE_INFINITY
  private currentGeneration = 0
  private disposed = false

  public constructor(options: TuningSchedulerOptions = {}) {
    this.throttleMs = Math.max(0, options.throttleMs ?? DEFAULT_THROTTLE_MS)
    this.onSupersede = options.onSupersede
    this.now = options.now ?? (() => Date.now())
    this.setTimeoutImpl = options.setTimeout ?? ((handler, timeout) => window.setTimeout(handler, timeout))
    this.clearTimeoutImpl = options.clearTimeout ?? ((handle) => window.clearTimeout(handle))
  }

  public get generation(): number {
    return this.currentGeneration
  }

  /**
   * 提交一个快照。相同内容键在成功完成/正在执行/已排队时直接忽略。
   * 返回 scheduled 时调用方可以立即把界面切到 syncing，但保留上一张正确画面。
   */
  public schedule(
    key: string,
    start: (generation: number, signal: AbortSignal) => Promise<void>,
    options: { readonly immediate?: boolean } = {}
  ): ScheduleResult {
    if (this.disposed) return "disposed"
    if (this.inFlight !== null && this.inFlight.key === key) return "duplicate"
    if (this.pending !== null && this.pending.key === key) {
      if (options.immediate === true) {
        this.pending = { ...this.pending, immediate: true }
        this.pump()
      }
      return "duplicate"
    }
    if (this.inFlight === null && this.pending === null && this.lastCompletedKey === key
      && this.lastFailedKey !== key) {
      return "duplicate"
    }

    this.currentGeneration += 1
    const generation = this.currentGeneration
    this.lastFailedKey = null
    this.pending = {
      key,
      start,
      immediate: options.immediate === true || this.pending?.immediate === true
    }
    if (this.inFlight !== null && this.inFlight.generation < generation) {
      // 只取消旧代次；不能用新代次取消，否则可能误伤刚开始的新任务。
      // 同时中止旧 HTTP 请求，保证响应不会乱序回写；后端由 DELETE 取消计算。
      this.onSupersede?.(generation - 1)
      this.inFlight.controller.abort()
      this.inFlight = null
    }
    this.pump()
    return "scheduled"
  }

  /** 松手、失焦或确认输入：跳过节流等待，立即提交最新快照。 */
  public flush(): void {
    if (this.disposed || this.pending === null) return
    this.pending = { ...this.pending, immediate: true }
    this.pump()
  }

  /** 切换图片、关闭底片模式或卸载视图：中止请求、清除计时器，返回最后代次。 */
  public dispose(): number {
    if (this.disposed) return this.currentGeneration
    this.disposed = true
    if (this.timer !== null) {
      this.clearTimeoutImpl(this.timer)
      this.timer = null
    }
    this.pending = null
    this.inFlight?.controller.abort()
    this.inFlight = null
    return this.currentGeneration
  }

  private pump(): void {
    if (this.disposed || this.inFlight !== null || this.pending === null) return
    if (this.timer !== null) {
      this.clearTimeoutImpl(this.timer)
      this.timer = null
    }
    const pending = this.pending
    const elapsed = this.now() - this.lastStartAt
    const delay = pending.immediate ? 0 : Math.max(0, this.throttleMs - elapsed)
    if (delay > 0) {
      this.timer = this.setTimeoutImpl(() => {
        this.timer = null
        this.startNext()
      }, delay)
      return
    }
    this.startNext()
  }

  private startNext(): void {
    if (this.disposed || this.inFlight !== null || this.pending === null) return
    const item = this.pending
    this.pending = null
    const controller = new AbortController()
    const generation = this.currentGeneration
    this.inFlight = { key: item.key, generation, controller }
    this.lastStartAt = this.now()
    void item.start(generation, controller.signal)
      .then(() => {
        if (this.inFlight?.controller !== controller) return
        if (controller.signal.aborted) return
        this.lastCompletedKey = item.key
        this.lastFailedKey = null
      })
      .catch(() => {
        if (this.inFlight?.controller !== controller) return
        if (!controller.signal.aborted) {
          this.lastFailedKey = item.key
        }
      })
      .finally(() => {
        if (this.inFlight?.controller === controller) {
          this.inFlight = null
        }
        this.pump()
      })
  }
}
