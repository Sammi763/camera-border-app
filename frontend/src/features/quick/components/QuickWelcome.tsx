/**
 * 快速出图模式欢迎页（空队列时显示）。
 *
 * 目标：让用户 10 秒内知道下一步做什么。
 * - Electron（正式应用）：选择照片 / 选择文件夹 / 拖入照片；
 * - 浏览器开发降级模式：额外提供「加载样片」（加载引擎内置样片），
 *   正式应用不显示该入口，也不允许样片按钮触发本机文件选择器。
 * 并展示本地优先的价值提示：本地处理、无需登录、EXIF 自动读取、批量导出。
 */

type QuickWelcomeProps = {
  readonly isBrowserMode: boolean
  readonly onPickFiles: () => void
  readonly onPickFolder: () => void
  readonly onLoadSamples: () => void
}

const VALUE_HINTS: readonly { readonly title: string; readonly body: string }[] = [
  { title: "本地处理", body: "图片只在你的电脑上处理，不上传任何服务器。" },
  { title: "无需登录", body: "打开即用，不需要账号、不需要网络。" },
  { title: "EXIF 自动读取", body: "数码照片自动读取相机与镜头信息，省去手动录入。" },
  { title: "批量导出", body: "一次导入多张，统一套模板后批量导出。" },
]

export const QuickWelcome = ({
  isBrowserMode,
  onPickFiles,
  onPickFolder,
  onLoadSamples
}: QuickWelcomeProps): JSX.Element => {
  return (
    <div className="quickWelcome">
      <div className="quickWelcomeInner">
        <h1 className="quickWelcomeTitle">把照片变成摄影作品卡</h1>
        <p className="quickWelcomeSubtitle">
          导入照片，自动读取拍摄信息，套用模板，导出成品。
        </p>

        <div className="quickWelcomeActions">
          <button type="button" className="primaryButton quickWelcomePrimary" onClick={onPickFiles}>
            选择照片
          </button>
          {!isBrowserMode && (
            <button type="button" className="ghostButton quickWelcomeSecondary" onClick={onPickFolder}>
              选择文件夹
            </button>
          )}
          {/* 「加载样片」仅浏览器开发降级模式提供：
              正式（Electron）应用的入口是 选择照片 / 选择文件夹 / 拖入照片，
              不允许把样片入口接到本机文件选择器。 */}
          {isBrowserMode && (
            <button type="button" className="ghostButton quickWelcomeSecondary" onClick={onLoadSamples}>
              加载样片
            </button>
          )}
        </div>

        <p className="quickWelcomeDropHint">
          {isBrowserMode
            ? "或点击「加载样片」使用内置样片体验流程"
            : "也可以直接把照片拖进这个窗口"}
        </p>

        <div className="quickWelcomeValues">
          {VALUE_HINTS.map((hint) => (
            <div key={hint.title} className="quickWelcomeValue">
              <span className="quickWelcomeValueTitle">{hint.title}</span>
              <span className="quickWelcomeValueBody">{hint.body}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
