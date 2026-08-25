import type { DesktopRuntime } from "../../types/runtime"
import type { EngineHealthState } from "../../features/preview/hooks/useEngineHealth"

/** 工作台模式：快速出图 / 高级编辑。 */
export type WorkspaceMode = "quick" | "advanced"

type TopBarProps = {
  readonly runtime: DesktopRuntime
  readonly health: EngineHealthState
  readonly mode: WorkspaceMode
  readonly onModeChange: (mode: WorkspaceMode) => void
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

export const TopBar = ({ runtime, health, mode, onModeChange }: TopBarProps): JSX.Element => {
  return (
    <header className="topbar">
      <div className="topbarTitle">
        <span className="topbarMark" aria-hidden="true" />
        <span className="topbarName">{runtime.appName}</span>
      </div>
      <div className="topbarModeSwitch" role="group" aria-label="工作台模式">
        <button
          type="button"
          className={`topbarModeBtn${mode === "quick" ? " topbarModeActive" : ""}`}
          onClick={() => onModeChange("quick")}
          title="快速出图：导入照片 → 选模板 → 导出"
        >
          快速出图
        </button>
        <button
          type="button"
          className={`topbarModeBtn${mode === "advanced" ? " topbarModeActive" : ""}`}
          onClick={() => onModeChange("advanced")}
          title="高级编辑：边框、渐变、字体、图层、模板管理"
        >
          高级编辑
        </button>
      </div>
      <span className="topbarBadge">{badgeLabel(health)}</span>
    </header>
  )
}
