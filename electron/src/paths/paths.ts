import { app } from "electron"
import path from "node:path"

/**
 * 路径解析（开发 / 打包双模式）。
 *
 * - 开发模式：编译产物在 electron/dist/，从该位置回溯到仓库根需要上溯 3 级
 *   （dist/paths → dist → electron → 仓库根）。
 * - 打包模式：electron-builder 将编译产物打进 app.asar（dist/**），
 *   前端产物、引擎 jar 与随包 Java Runtime 通过 extraResources 放到
 *   process.resourcesPath 下：
 *
 *     <resources>/
 *       app.asar/            （electron 编译产物 + package.json）
 *       frontend/            （前端构建产物，app:// 协议从这里加载）
 *       java-engine/camera-border-engine.jar
 *       java-runtime/        （随包 Java Runtime）
 */
export const isPackaged: boolean = app.isPackaged

/**
 * 打包资源目录。开发模式下无意义（等于仓库内构建产物目录的父级），勿用于开发分支。
 */
export const resourcesDir = isPackaged ? process.resourcesPath : path.resolve(__dirname, "../..")

/** 仓库根目录（仅开发模式有真实含义）。 */
export const projectRoot = path.resolve(__dirname, "../../..")

/** 前端构建产物目录（app:// 协议从这里加载文件）。 */
export const frontendDistDir = isPackaged
  ? path.join(resourcesDir, "frontend")
  : path.join(projectRoot, "frontend", "dist")

/** 前端构建入口文件（当前通过自定义协议加载，此常量保留供参考）。 */
export const frontendDistPath = path.join(frontendDistDir, "index.html")

/**
 * 编译后的 preload 脚本路径。
 * 开发与打包模式布局一致（dist/preload/preload.js，打包时位于 app.asar 内），
 * __dirname 推导两种模式都成立。
 */
export const preloadPath = path.join(__dirname, "..", "preload", "preload.js")

/** 引擎 jar 文件路径。
 * - 开发模式：java-engine/target/camera-border-engine.jar（Maven 构建产物）。
 * - 打包模式：<resources>/java-engine/camera-border-engine.jar（extraResources）。
 */
export const engineJarPath = isPackaged
  ? path.join(resourcesDir, "java-engine", "camera-border-engine.jar")
  : path.join(projectRoot, "java-engine", "target", "camera-border-engine.jar")

/** 引擎子进程工作目录。 */
export const engineCwd = isPackaged
  ? path.join(resourcesDir, "java-engine")
  : projectRoot

/**
 * 随包 Java Runtime 目录（extraResources: java-runtime）。
 * 开发模式回退到仓库 runtime/ 目录（本地验证打包布局用）。
 */
export const javaRuntimeDir = isPackaged
  ? path.join(resourcesDir, "java-runtime")
  : path.join(projectRoot, "runtime")
