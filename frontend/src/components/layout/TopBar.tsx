import type { DesktopRuntime } from "../../types/runtime"

/** 工作台主题：深色影棚、暖灰浅色或跟随系统。 */
export type StudioTheme = "dark" | "warm" | "system"

type TopBarProps = {
  readonly runtime: DesktopRuntime
  readonly hasPhotos: boolean
  readonly theme: StudioTheme
  readonly onThemeChange: (theme: StudioTheme) => void
  readonly onPickFiles: () => void
  readonly onPickFolder: () => void
}

export const TopBar = ({
  runtime,
  hasPhotos,
  theme,
  onThemeChange,
  onPickFiles,
  onPickFolder
}: TopBarProps): JSX.Element => {
  return (
    <header className="topbar">
      <div className="topbarTitle">
        <span className="topbarMark" aria-hidden="true" />
        <span className="topbarName">{runtime.appName}</span>
      </div>
      <div className="topbarActions">
        {hasPhotos && (
          <div className="topbarImportActions" role="group" aria-label="导入照片">
            <button type="button" className="topbarActionButton" onClick={onPickFiles}>选择照片</button>
            <button type="button" className="topbarActionButton" onClick={onPickFolder}>选择文件夹</button>
          </div>
        )}
        <label className="topbarThemeControl">
          <span>主题</span>
          <select aria-label="界面主题" value={theme} onChange={(event) => onThemeChange(event.target.value as StudioTheme)}>
            <option value="dark">深色影棚</option>
            <option value="warm">暖灰浅色</option>
            <option value="system">跟随系统</option>
          </select>
        </label>
      </div>
    </header>
  )
}
