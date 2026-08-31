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
  /** 读取 userData 中的 Roll 胶卷数据 JSON 字符串。文件不存在时返回 "[]"。（旧版兼容，不扩展） */
  readonly readRolls: () => Promise<string>
  /** 将 Roll 胶卷数据 JSON 字符串写入 userData 中的 rolls 文件。（旧版兼容，不扩展） */
  readonly writeRolls: (json: string) => Promise<void>
  /** 读取 userData 中的摄影预设 JSON 字符串。文件不存在时返回 "[]"。 */
  readonly readPresets: () => Promise<string>
  /** 将摄影预设 JSON 字符串写入 userData 中的预设文件。 */
  readonly writePresets: (json: string) => Promise<void>
  /** 打开保存对话框，将模板 JSON 写入用户选择的路径；取消返回 null。 */
  readonly exportTemplateJson: (defaultFileName: string, json: string) => Promise<string | null>
  /** 打开文件选择对话框，读取并返回模板 JSON 字符串；取消返回 null。 */
  readonly importTemplateJson: () => Promise<string | null>
  /**
   * 将 HEIC/HEIF 文件转换为临时 JPEG 文件供引擎处理。
   * 返回转换后的临时文件路径数组（与输入路径一一对应）。
   * 转换失败的文件返回 null（保持原位）。
   * 非 HEIC 文件原样返回。
   */
  readonly convertHeicFiles: (paths: readonly string[]) => Promise<readonly (string | null)[]>
  /**
   * 枚举系统已安装的字体列表。
   * 返回字体族名称数组；获取失败时返回空数组（前端回退到内置列表）。
   */
  readonly listSystemFonts: () => Promise<readonly string[]>
  /**
   * 在系统文件管理器中打开指定目录（批量导出后查看产物）。
   * 目录不存在或打开失败时返回 false，不会抛出异常。
   */
  readonly openDirectory: (dirPath: string) => Promise<boolean>
  /**
   * 读取引擎托管诊断信息（引擎启动失败页面使用）。
   * 仅托管模式下有意义；未托管或引擎从未启动时返回 null。
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
   * 引擎不可用时工作台可继续本地预览（不展示全屏错误页）。
   * 仅接受绝对路径、常规文件和支持的栅格格式；参数非法或解码失败时返回 null，
   * 不抛异常到渲染进程。所有 IO 在主进程完成，渲染进程不获得文件系统权限。
   */
  readonly loadLocalImagePreview: (
    imagePath: string,
    maxWidth: number,
    maxHeight: number
  ) => Promise<LocalImagePreview | null>
  /**
   * 检查工作会话中已知图片源路径是否仍是可读取的常规文件。
   * 仅接受受支持图片扩展名与数量上限内的绝对路径；不返回文件内容或其他元数据。
   */
  readonly checkImagePaths: (paths: readonly string[]) => Promise<readonly boolean[]>
  /**
   * 获取预览缓存失效所需的最小文件版本信息。
   * 仅接受受支持图片扩展名与数量上限内的绝对路径；结果与输入等长，非法/缺失项为 null。
   */
  readonly getImageFileVersions: (paths: readonly string[]) => Promise<readonly (ImageFileVersion | null)[]>
  /**
   * 在系统默认应用中打开引擎日志文件（绝对路径）。
   * 由 IPC 层校验路径必须在 userData/logs 下；不存在或打开失败时返回 false。
   * 用于「查看日志」按钮直接打开日志文件本身（而非所在目录）。
   */
  readonly openLogFile: (logPath: string) => Promise<boolean>
}

/** 本地图片预览结果（dataURL + 尺寸）。 */
export type LocalImagePreview = {
  readonly dataUrl: string
  readonly width: number
  readonly height: number
}

/** 图片缓存版本：只暴露 mtime 与字节数，不暴露文件内容或目录信息。 */
export type ImageFileVersion = {
  readonly mtimeMs: number
  readonly sizeBytes: number
}

/**
 * 引擎托管诊断信息（引擎启动失败页面使用）。
 * 由主进程根据引擎 jar / 运行时 / 进程 / 端口状态分类生成。
 */
export type EngineDiagnostics = {
  readonly code: "ok" | "starting" | "jar-missing" | "runtime-missing" | "runtime-blocked" | "start-failed" | "port-conflict" | "health-timeout" | "unknown"
  /** 面向用户的中文描述。 */
  readonly message: string
  /** 引擎日志文件绝对路径（可为空）。 */
  readonly logPath: string | null
  /** 引擎进程是否存活（starting / running / unhealthy 均视为存活）。 */
  readonly processAlive: boolean
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
  READ_PRESETS: "desktop:read-presets",
  WRITE_PRESETS: "desktop:write-presets",
  EXPORT_TEMPLATE_JSON: "desktop:export-template-json",
  IMPORT_TEMPLATE_JSON: "desktop:import-template-json",
  CONVERT_HEIC_FILES: "desktop:convert-heic-files",
  LIST_SYSTEM_FONTS: "desktop:list-system-fonts",
  OPEN_DIRECTORY: "desktop:open-directory",
  GET_ENGINE_DIAGNOSTICS: "desktop:get-engine-diagnostics",
  RETRY_ENGINE_START: "desktop:retry-engine-start",
  SHOW_NOTIFICATION: "desktop:show-notification",
  LOAD_LOCAL_IMAGE_PREVIEW: "desktop:load-local-image-preview",
  CHECK_IMAGE_PATHS: "desktop:check-image-paths",
  GET_IMAGE_FILE_VERSIONS: "desktop:get-image-file-versions",
  OPEN_LOG_FILE: "desktop:open-log-file"
} as const
