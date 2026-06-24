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
 * preload 暴露的精选运行时能力。渲染进程调用这些轻量桥接方法，
 * 真正的工作由主进程执行，从而确保渲染进程永远无法直接访问
 * 文件系统（ARCHITECTURE.md §1）。
 */
export type DesktopBridge = {
  readonly selectImages: () => Promise<string[]>
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
}

declare global {
  interface Window {
    readonly desktopRuntime?: DesktopRuntime
    readonly desktop?: DesktopBridge
  }
}
