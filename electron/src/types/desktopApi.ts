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
export type DesktopApi = {
  /** 打开原生图片选择器，返回选中的文件绝对路径数组。 */
  readonly selectImages: () => Promise<string[]>
  /** 打开系统保存文件对话框，返回用户选择的绝对路径；取消时返回 null。 */
  readonly selectExportPath: (defaultFileName: string) => Promise<string | null>
  /** 打开原生目录选择器，返回用户选择的目录绝对路径；取消时返回 null。 */
  readonly selectExportDirectory: () => Promise<string | null>
  /** 读取 userData 中的模板 JSON 字符串。文件不存在时返回 "[]"。 */
  readonly readTemplates: () => Promise<string>
  /** 将模板 JSON 字符串写入 userData 中的模板文件。 */
  readonly writeTemplates: (json: string) => Promise<void>
}

/**
 * IPC channel 常量。
 *
 * preload 和主进程共享这些 channel 名称，
 * 避免字符串散落在多处导致不一致。
 */
export const IPC_CHANNELS = {
  SELECT_IMAGES: "desktop:select-images",
  SELECT_EXPORT_PATH: "desktop:select-export-path",
  SELECT_EXPORT_DIRECTORY: "desktop:select-export-directory",
  READ_TEMPLATES: "desktop:read-templates",
  WRITE_TEMPLATES: "desktop:write-templates"
} as const
