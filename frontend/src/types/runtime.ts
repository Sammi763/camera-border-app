/**
 * Electron preload 暴露在 `window.desktopRuntime` 上的静态运行时信息结构。
 * 仅包含启动期配置；引擎的实时状态从健康检查端点获取，不在此承载。
 */
export type DesktopRuntime = {
  readonly appName: string
  readonly platform: string
  readonly engine: {
    readonly managed: boolean
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
 * 引擎托管诊断信息（引擎启动失败页面使用）。
 * 字段与 Electron 主进程 engineDiagnostics 一致，前端独立维护副本。
 */
export type EngineDiagnostics = {
  /** 诊断分类（与 Electron 主进程 desktopApi.EngineDiagnostics.code 保持一致）。 */
  readonly code: "ok" | "starting" | "jar-missing" | "runtime-missing" | "runtime-blocked" | "start-failed" | "port-conflict" | "health-timeout" | "unknown"
  /** 面向用户的中文描述。 */
  readonly message: string
  /** 引擎日志文件绝对路径（可为空）。 */
  readonly logPath: string | null
  /** 引擎进程是否存活。 */
  readonly processAlive: boolean
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
   * 文件不存在时返回 "[]"。（旧版兼容，不扩展）
   */
  readonly readRolls: () => Promise<string>
  /**
   * 将 Roll 胶卷数据 JSON 字符串写入 userData 中的 rolls 文件。
   * （旧版兼容，不扩展）
   */
  readonly writeRolls: (json: string) => Promise<void>
  /**
   * 读取 userData 中的摄影预设 JSON 字符串。
   * 文件不存在时返回 "[]"。
   */
  readonly readPresets: () => Promise<string>
  /**
   * 将摄影预设 JSON 字符串写入 userData 中的预设文件。
   */
  readonly writePresets: (json: string) => Promise<void>
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
  /**
   * 将 HEIC/HEIF 文件转换为临时 JPEG 文件供引擎处理。
   * 返回转换后的临时文件路径数组（与输入路径一一对应）。
   * 转换失败的文件返回 null。非 HEIC 文件原样返回。
   */
  readonly convertHeicFiles: (paths: readonly string[]) => Promise<readonly (string | null)[]>
  /**
   * 枚举系统已安装的字体列表。
   * 返回字体族名称数组；获取失败时返回空数组。
   */
  readonly listSystemFonts: () => Promise<readonly string[]>
  /**
   * 在系统文件管理器中打开指定目录（批量导出后查看产物）。
   * 目录不存在或打开失败时返回 false，不会抛出异常。
   */
  readonly openDirectory: (dirPath: string) => Promise<boolean>
  /**
   * 读取引擎托管诊断信息（引擎启动失败页面使用）。
   * 仅托管模式下有意义；未托管或桌面桥不存在时返回 null。
   */
  readonly getEngineDiagnostics: () => Promise<EngineDiagnostics | null>
  /** 请求桌面壳重试启动引擎（引擎启动失败页面使用）。 */
  readonly retryEngineStart: () => Promise<boolean>
  /**
   * 展示系统通知（导出完成/失败反馈）。
   * title/body 必须是字符串且非空；参数非法或平台不支持时返回 false，
   * 不会抛出异常。通知只展示文件名等简短文案，不展示绝对路径。
   */
  readonly showNotification: (title: string, body: string) => Promise<boolean>
  /**
   * 在主进程读取本地图片并生成 dataURL 预览。
   * 引擎不可用时工作台可继续本地预览。
   * 仅接受绝对路径、常规文件和支持的栅格格式；参数非法或解码失败时返回 null。
   */
  readonly loadLocalImagePreview: (
    imagePath: string,
    maxWidth: number,
    maxHeight: number
  ) => Promise<LocalImagePreview | null>
  /** 检查已恢复会话中的图片源路径是否仍可读取；不返回文件内容。 */
  readonly checkImagePaths?: (paths: readonly string[]) => Promise<readonly boolean[]>
  /** 读取图片 mtime 与字节数，供预览缓存按源文件版本失效。 */
  readonly getImageFileVersions?: (paths: readonly string[]) => Promise<readonly (ImageFileVersion | null)[]>
  /**
   * 在系统默认应用中打开引擎日志文件。
   * 路径必须位于 userData/logs 下；不存在或打开失败时返回 false。
   */
  readonly openLogFile: (logPath: string) => Promise<boolean>
}

/** 本地图片预览结果。 */
export type LocalImagePreview = {
  readonly dataUrl: string
  readonly width: number
  readonly height: number
}

/** 预览缓存使用的受限文件版本信息；不包含文件内容。 */
export type ImageFileVersion = {
  readonly mtimeMs: number
  readonly sizeBytes: number
}

declare global {
  interface Window {
    readonly desktopRuntime?: DesktopRuntime
    readonly desktop?: DesktopBridge
  }
}
