/**
 * 应用内帮助面板：面向用户的静态简中说明。
 *
 * 内容从 docs/offline-help.md 提炼为应用内版本；不读取文件系统，
 * 不写测试数量等会漂移的数字。展示在「帮助」抽屉中。
 */

const GETTING_STARTED_STEPS: readonly string[] = [
  "导入照片：点击「选择照片」或「选择文件夹」，也可以直接把图片拖进窗口。",
  "调整样式与摄影信息：在「样式」页签选择版式，在「摄影信息」页签核对拍摄信息或应用拍摄信息预设。",
  "选择输出档位：在「输出」页签选择快速分享、标准交付或高保真归档。",
  "导出：在底部导出区先选择范围（当前图片 / 已选 / 全部），单张点「导出原图」，批量点批量导出按钮；完成后可查看实际尺寸、色彩与元数据报告。"
]

const INPUT_FORMATS: readonly { readonly title: string; readonly body: string }[] = [
  { title: "常规图片", body: "JPEG、PNG、TIFF。" },
  { title: "HEIC / HEIF", body: "iPhone 等设备格式，由随包解码助手转换为临时 PNG 后处理，原图保持不变。" },
  { title: "RAW", body: "NEF、CR2、CR3、ARW、RAF、DNG、ORF、RW2、PEF。仅使用文件内嵌的 JPEG 预览，不做传感器 RAW 显影。" }
]

const EXPORT_TIERS: readonly { readonly title: string; body: string }[] = [
  { title: "快速分享", body: "适合社交平台：长边最多 2048（小图不放大），统一转为 sRGB 色彩，并移除位置（GPS）信息。" },
  { title: "标准交付", body: "适合日常交付：保持原图尺寸，保留色彩配置文件与全部元数据（含位置信息）。" },
  { title: "高保真归档", body: "适合长期归档：TIFF 输出，尽量保留源位深与色彩配置文件。" }
]

const FAQ: readonly { readonly question: string; readonly answer: string }[] = [
  {
    question: "我的照片会被上传吗？",
    answer: "不会。导入、预览、编辑和导出全部在本机完成，应用不依赖远程服务，也不需要登录。"
  },
  {
    question: "需要联网或安装 Java / ExifTool 吗？",
    answer: "不需要。运行引擎、解码器和工具随安装包提供，正常使用不需要网络连接。"
  },
  {
    question: "导出会改动我的原图吗？",
    answer: "不会。原图始终只读，导出结果写入你指定的位置；影响画质或元数据的选项都会显式展示。"
  },
  {
    question: "「当前图片」和「已选」有什么区别？",
    answer: "「当前图片」指预览中正在查看的那一张；「已选」指复选框勾选的图片集合。两者相互独立，可以不同。"
  },
  {
    question: "顶部状态栏提示引擎不可用怎么办？",
    answer: "导出按钮会禁用并显示原因，即时预览仍可用。可按提示重试，或通过状态栏入口查看日志排查。"
  }
]

export const HelpPanel = (): JSX.Element => (
  <div className="helpPanel">
    <section className="helpPanelSection" aria-label="四步上手">
      <h3 className="helpPanelSectionTitle">四步上手</h3>
      <ol className="helpPanelSteps">
        {GETTING_STARTED_STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </section>

    <section className="helpPanelSection" aria-label="支持的输入格式">
      <h3 className="helpPanelSectionTitle">支持的输入格式</h3>
      <dl className="helpPanelDefinitionList">
        {INPUT_FORMATS.map((item) => (
          <div key={item.title} className="helpPanelDefinitionRow">
            <dt>{item.title}</dt>
            <dd>{item.body}</dd>
          </div>
        ))}
      </dl>
    </section>

    <section className="helpPanelSection" aria-label="导出档位说明">
      <h3 className="helpPanelSectionTitle">三个导出档位</h3>
      <dl className="helpPanelDefinitionList">
        {EXPORT_TIERS.map((item) => (
          <div key={item.title} className="helpPanelDefinitionRow">
            <dt>{item.title}</dt>
            <dd>{item.body}</dd>
          </div>
        ))}
      </dl>
    </section>

    <section className="helpPanelSection" aria-label="常见问题">
      <h3 className="helpPanelSectionTitle">常见问题</h3>
      <dl className="helpPanelDefinitionList">
        {FAQ.map((item) => (
          <div key={item.question} className="helpPanelDefinitionRow">
            <dt>{item.question}</dt>
            <dd>{item.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  </div>
)
