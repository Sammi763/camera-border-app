import type { DesktopRuntime } from "../../types/runtime"
import type { EngineHealthState } from "../../features/preview/hooks/useEngineHealth"

type TopBarProps = {
  readonly runtime: DesktopRuntime
  readonly health: EngineHealthState
}

/** 引擎状态映射为中文。将 "ok" 等英文状态值转换为用户可读的中文。 */
const badgeLabel = (health: EngineHealthState): string => {
  switch (health.kind) {
    case "idle":
      return "引擎待机"
    case "loading":
      return "引擎连接中"
    case "ready": {
      const raw = health.health.status
      const mapped = raw === "ok" ? "正常" : raw
      return `引擎 ${mapped}`
    }
    case "error":
      return "引擎离线"
  }
}

export const TopBar = ({ runtime, health }: TopBarProps): JSX.Element => {
  return (
    <header className="topbar">
      <div className="topbarTitle">
        <span className="topbarMark" aria-hidden="true" />
        <span className="topbarName">{runtime.appName}</span>
      </div>
      <span className="topbarBadge">{badgeLabel(health)}</span>
    </header>
  )
}
