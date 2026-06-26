/**
 * preload 暴露给前端的类型定义。
 *
 * 本文件是 Electron 与渲染进程之间的契约层：
 * - preload 用这些类型构造暴露对象
 * - IPC handler 用 IPC_CHANNELS 常量注册通道
 *
 * 前端有自己独立的类型定义，不跨包导入本文件，避免类型耦合。
 * 允许双方各自维护一份轻量类型副本，但字段名必须保持一致。
 */

/**
 * 暴露到 window.desktopRuntime 的启动时静态信息。
 *
 * 不携带实时引擎状态。渲染进程通过轮询健康端点获取实时状态，
 * 保持 preload 不依赖任何 IPC 管道。
 */
export type DesktopRuntime = {
  readonly appName: string
  readonly platform: NodeJS.Platform
  readonly engine: {
    /** 桌面壳是否管理引擎生命周期（区别于外部引擎）。 */
    readonly managed: boolean
    readonly baseUrl: string
  }
}

/**
 * 暴露到 window.desktop 的安全能力集合。
 *
 * 这些是 ipcRenderer.invoke 的薄封装——主进程执行实际操作，
 * 渲染进程永远无法直接访问文件系统或进程。
 */
/** 图片来源选择结果。 */
export type ImageSourceResult = {
  /** 选择类型：文件多选或文件夹。 */
  readonly kind: "files" | "directory"
  /** 选中的图片绝对路径数组。文件夹模式下为该目录内所有图片。 */
  readonly paths: readonly string[]
}

export type DesktopApi = {
  /** 打开原生图片选择器，返回选中的文件绝对路径数组。 */
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
   * 打开系统文件夹选择对话框，返回该目录下所有支持格式的图片路径。
   * 返回 { kind: "directory", paths }；取消返回 null。
   * 目录为空时返回 { kind: "directory", paths: [] }。
   */
  readonly selectImageFolder: () => Promise<ImageSourceResult | null>
  /** 打开系统保存文件对话框，返回用户选择的绝对路径；取消时返回 null。 */
  readonly selectExportPath: (defaultFileName: string) => Promise<string | null>
  /** 打开原生目录选择器，返回用户选择的目录绝对路径；取消时返回 null。 */
  readonly selectExportDirectory: () => Promise<string | null>
  /** 读取 userData 中的模板 JSON 字符串。文件不存在时返回 "[]"。 */
  readonly readTemplates: () => Promise<string>
  /** 将模板 JSON 字符串写入 userData 中的模板文件。 */
  readonly writeTemplates: (json: string) => Promise<void>
  /** 读取 userData 中的摄影资产库 JSON 字符串。文件不存在时返回 "[]"。 */
  readonly readAssets: () => Promise<string>
  /** 将摄影资产库 JSON 字符串写入 userData 中的资产库文件。 */
  readonly writeAssets: (json: string) => Promise<void>
  /** 读取 userData 中的 Roll 胶卷数据 JSON 字符串。文件不存在时返回 "[]"。 */
  readonly readRolls: () => Promise<string>
  /** 将 Roll 胶卷数据 JSON 字符串写入 userData 中的 rolls 文件。 */
  readonly writeRolls: (json: string) => Promise<void>
  /** 打开保存对话框，将模板 JSON 写入用户选择的路径；取消返回 null。 */
  readonly exportTemplateJson: (defaultFileName: string, json: string) => Promise<string | null>
  /** 打开文件选择对话框，读取并返回模板 JSON 字符串；取消返回 null。 */
  readonly importTemplateJson: () => Promise<string | null>
}

/**
 * IPC channel 常量。
 *
 * preload 和主进程共享这些 channel 名称，
 * 避免字符串散落在多处导致不一致。
 */
export const IPC_CHANNELS = {
  SELECT_IMAGES: "desktop:select-images",
  SELECT_IMAGE_SOURCES: "desktop:select-image-sources",
  SELECT_IMAGE_FILES: "desktop:select-image-files",
  SELECT_IMAGE_FOLDER: "desktop:select-image-folder",
  SELECT_EXPORT_PATH: "desktop:select-export-path",
  SELECT_EXPORT_DIRECTORY: "desktop:select-export-directory",
  READ_TEMPLATES: "desktop:read-templates",
  WRITE_TEMPLATES: "desktop:write-templates",
  READ_ASSETS: "desktop:read-assets",
  WRITE_ASSETS: "desktop:write-assets",
  READ_ROLLS: "desktop:read-rolls",
  WRITE_ROLLS: "desktop:write-rolls",
  EXPORT_TEMPLATE_JSON: "desktop:export-template-json",
  IMPORT_TEMPLATE_JSON: "desktop:import-template-json"
} as const
