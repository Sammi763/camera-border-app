/**
 * 变量插入助手面板。
 *
 * 提供变量按钮和快捷模板，点击后将变量插入文字内容输入框。
 * 技术拍摄变量与身份变量统一提供入口；旧的冲洗/扫描/实验室/Roll 变量仍保留解析兼容。
 */

type VariableHelpPanelProps = {
  /** 当前文字内容（可能是全局设置或每图覆盖）。 */
  readonly currentText: string
  /** 更新文字内容。 */
  readonly onTextChange: (text: string) => void
}

/** 可用变量列表。 */
const VARIABLES = [
  { var: "{Camera}", label: "相机" },
  { var: "{Lens}", label: "镜头" },
  { var: "{Film}", label: "胶片" },
  { var: "{CaptureFormat}", label: "画幅" },
  { var: "{Location}", label: "地点" },
  { var: "{FrameNumber}", label: "帧号" },
  { var: "{FNumber}", label: "光圈" },
  { var: "{ExposureTime}", label: "曝光时间" },
  { var: "{ISO}", label: "ISO" },
  { var: "{FocalLength}", label: "焦距" },
  { var: "{DateTimeOriginal}", label: "拍摄时间" }
] as const

/** 快捷模板。 */
const COMMON_TEMPLATES = [
  { label: "经典参数", template: "{Camera} · {Lens} · {Film}" },
  { label: "拍摄参数", template: "{FNumber} · {ExposureTime} · {ISO} · {FocalLength}" },
  { label: "胶片信息", template: "{CaptureFormat} · {Film} · {Location}" },
  { label: "逐行排列", template: "{Camera}\n{Lens}\n{Film}" }
] as const

export const VariableHelpPanel = ({
  currentText,
  onTextChange
}: VariableHelpPanelProps): JSX.Element => {

  const handleInsertVariable = (variable: string): void => {
    onTextChange(currentText + variable)
  }

  const handleApplyTemplate = (template: string): void => {
    onTextChange(template)
  }

  return (
    <fieldset className="settingGroup">
      <legend className="settingLabel">变量插入</legend>

      <div className="variableButtons">
        {VARIABLES.map((v) => (
          <button
            key={v.var}
            type="button"
            className="ghostButton variableChip"
            onClick={() => handleInsertVariable(v.var)}
            title={`插入 ${v.var}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="variableCommonTemplates">
        {COMMON_TEMPLATES.map((t) => (
          <button
            key={t.label}
            type="button"
            className="ghostButton"
            onClick={() => handleApplyTemplate(t.template)}
            title={t.template}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="settingsCapabilityHint">
        变量将在预览和导出时自动替换为实际摄影信息。
      </p>
    </fieldset>
  )
}
