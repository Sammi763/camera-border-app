/**
 * Electron preload 暴露在 `window.desktopRuntime` 上的静态运行时信息结构。
 * 仅包含启动期配置；引擎的实时状态从健康检查端点获取，不在此承载。
 */
export type DesktopRuntime = {
  readonly appName: string
  readonly platform: string
  readonly engine: {
    readonly managed: boolean
    readonly baseUrl: string
  }
}

/**
 * 图片来源选择结果。
 * 与 Electron 端 ImageSourceResult 保持一致，但前端独立维护类型副本。
 */
export type ImageSourceResult = {
  /** 选择类型：文件多选或文件夹。 */
  readonly kind: "files" | "directory"
  /** 选中的图片绝对路径数组。 */
  readonly paths: readonly string[]
}

/**
 * preload 暴露的精选运行时能力。渲染进程调用这些轻量桥接方法，
 * 真正的工作由主进程执行，从而确保渲染进程永远无法直接访问
 * 文件系统（ARCHITECTURE.md §1）。
 */
export type DesktopBridge = {
  readonly selectImages: () => Promise<string[]>
  /**
   * 打开系统对话框，允许选择图片文件或文件夹。
   * - 选文件：返回 { kind: "files", paths: [...] }
   * - 选文件夹：扫描目录内支持的图片，返回 { kind: "directory", paths: [...] }
   * - 取消：返回 null
   */
  readonly selectImageSources: () => Promise<ImageSourceResult | null>
  /**
   * 打开系统文件选择对话框，仅允许选择图片文件（多选）。
   * 返回选中的文件绝对路径数组；取消返回空数组。
   */
  readonly selectImageFiles: () => Promise<readonly string[]>
  /**
   * 打开系统文件夹选择对话框，扫描目录内支持格式的图片。
   * 返回 { kind: "directory", paths }；取消返回 null。
   */
  readonly selectImageFolder: () => Promise<ImageSourceResult | null>
  /**
   * 打开系统保存文件对话框，返回用户选择的绝对路径。
   * 用户取消时返回 null。
   */
  readonly selectExportPath: (defaultFileName: string) => Promise<string | null>
  /**
   * 打开原生目录选择器，返回用户选择的目录绝对路径。
   * 用户取消时返回 null。
   */
  readonly selectExportDirectory: () => Promise<string | null>
  /**
   * 读取 userData 中的模板 JSON 字符串。
   * 文件不存在时返回 "[]"。
   */
  readonly readTemplates: () => Promise<string>
  /**
   * 将模板 JSON 字符串写入 userData 中的模板文件。
   */
  readonly writeTemplates: (json: string) => Promise<void>
  /**
   * 读取 userData 中的摄影资产库 JSON 字符串。
   * 文件不存在时返回 "[]"。
   */
  readonly readAssets: () => Promise<string>
  /**
   * 将摄影资产库 JSON 字符串写入 userData 中的资产库文件。
   */
  readonly writeAssets: (json: string) => Promise<void>
  /**
   * 读取 userData 中的 Roll 胶卷数据 JSON 字符串。
   * 文件不存在时返回 "[]"。
   */
  readonly readRolls: () => Promise<string>
  /**
   * 将 Roll 胶卷数据 JSON 字符串写入 userData 中的 rolls 文件。
   */
  readonly writeRolls: (json: string) => Promise<void>
  /**
   * 打开保存对话框，将模板 JSON 写入用户选择的路径。
   * 用户取消时返回 null。
   */
  readonly exportTemplateJson: (defaultFileName: string, json: string) => Promise<string | null>
  /**
   * 打开文件选择对话框，读取并返回模板 JSON 字符串。
   * 用户取消时返回 null。
   */
  readonly importTemplateJson: () => Promise<string | null>
}

declare global {
  interface Window {
    readonly desktopRuntime?: DesktopRuntime
    readonly desktop?: DesktopBridge
  }
}
