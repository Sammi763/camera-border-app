import type { DesktopRuntime } from "../../types/runtime"
import type { EngineHealthState } from "../../features/preview/hooks/useEngineHealth"
import type { PreviewState } from "../../features/preview/types"

type StatusPanelProps = {
  readonly runtime: DesktopRuntime
  readonly health: EngineHealthState
  readonly preview: PreviewState
}

const engineStatusText = (health: EngineHealthState): string => {
  switch (health.kind) {
    case "idle":
      return "待机"
    case "loading":
      return "连接中…"
    case "ready": {
      const raw = health.health.status
      return raw === "ok" ? "正常" : raw
    }
    case "error":
      return "引擎离线"
  }
}

const engineDotClassName = (health: EngineHealthState): string => {
  switch (health.kind) {
    case "ready":
      return "dot dotOk"
    case "error":
      return "dot dotErr"
    case "idle":
    case "loading":
      return "dot dotIdle"
  }
}

const previewStatusText = (preview: PreviewState): string => {
  switch (preview.kind) {
    case "idle":
      return "暂无图片"
    case "active":
      return "即时预览"
  }
}

const previewDotClassName = (preview: PreviewState): string => {
  switch (preview.kind) {
    case "active":
      return "dot dotOk"
    case "idle":
      return "dot dotIdle"
  }
}

export const StatusPanel = ({ runtime, health, preview }: StatusPanelProps): JSX.Element => {
  const managedLabel = runtime.engine.managed ? "托管" : "外部"

  return (
    <footer className="statusbar" role="contentinfo">
      <div className="statusbarGroup">
        <span className="statusbarItem">
          <span className={engineDotClassName(health)} aria-hidden="true" />
          <span>引擎 · {engineStatusText(health)}</span>
        </span>
        <span className="statusbarItem">
          <span className={previewDotClassName(preview)} aria-hidden="true" />
          <span>预览 · {previewStatusText(preview)}</span>
        </span>
      </div>
      <span className="statusbarMeta">
        {runtime.engine.baseUrl} · {runtime.platform} · {managedLabel}
      </span>
    </footer>
  )
}
