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

const VALUE_HINTS: readonly { readonly title: string; readonly body: string }[] = [
  { title: "本地处理", body: "图片只在你的电脑上处理，不上传任何服务器。" },
  { title: "无需登录", body: "打开即用，不需要账号、不需要网络。" },
  { title: "EXIF 自动读取", body: "数码照片自动读取相机与镜头信息，省去手动录入。" },
  { title: "统一工作台", body: "队列、预览、样式、摄影信息和输出集中在一个工作区。" }
]

export const WorkspaceWelcome = ({
  isBrowserMode,
  onPickFiles,
  onPickFolder,
  onLoadSamples
}: WorkspaceWelcomeProps): JSX.Element => (
  <div className="workspaceWelcome">
    <div className="workspaceWelcomeInner">
      <p className="workspaceWelcomeKicker">CAMERA BORDER WORKSPACE</p>
      <h1 className="workspaceWelcomeTitle">把照片变成摄影作品卡</h1>
      <p className="workspaceWelcomeSubtitle">
        导入照片，自动读取拍摄信息，套用版式，导出成品。
      </p>

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
        {isBrowserMode ? "或点击「加载样片」使用内置样片体验流程" : "也可以直接把照片拖进这个窗口"}
      </p>

      <div className="workspaceWelcomeValues">
        {VALUE_HINTS.map((hint) => (
          <div key={hint.title} className="workspaceWelcomeValue">
            <span className="workspaceWelcomeValueTitle">{hint.title}</span>
            <span className="workspaceWelcomeValueBody">{hint.body}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
)
