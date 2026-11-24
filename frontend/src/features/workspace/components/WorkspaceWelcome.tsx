/**
 * 统一工作台空队列欢迎页。
 * 正式桌面应用只提供本机导入；浏览器降级模式额外提供内置样片入口。
 */

type WorkspaceWelcomeProps = {
  readonly isBrowserMode: boolean
  readonly onPickFiles: () => void
  readonly onPickFolder: () => void
  readonly onLoadSamples: () => void
}

export const WorkspaceWelcome = ({
  isBrowserMode,
  onPickFiles,
  onPickFolder,
  onLoadSamples
}: WorkspaceWelcomeProps): JSX.Element => (
  <div className="workspaceWelcome">
    <div className="workspaceWelcomeInner">
      <h1 className="workspaceWelcomeTitle">导入照片</h1>
      <p className="workspaceWelcomeSubtitle">照片在本机处理。</p>

      <div className="workspaceWelcomeActions">
        <button type="button" className="primaryButton workspaceWelcomePrimary" onClick={onPickFiles}>
          选择照片
        </button>
        {!isBrowserMode && (
          <button type="button" className="ghostButton workspaceWelcomeSecondary" onClick={onPickFolder}>
            选择文件夹
          </button>
        )}
        {isBrowserMode && (
          <button type="button" className="ghostButton workspaceWelcomeSecondary" onClick={onLoadSamples}>
            加载样片
          </button>
        )}
      </div>

      <p className="workspaceWelcomeDropHint">
        也可以直接把照片拖进这个窗口
      </p>
      <p className="workspaceWelcomeShortcutHint">
        按 <kbd className="workspaceWelcomeKbd">?</kbd> 查看快捷键
      </p>
    </div>
  </div>
)
