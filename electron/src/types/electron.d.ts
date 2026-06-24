import type { DesktopRuntime, DesktopApi } from "./desktopApi.js"

/**
 * 全局 window 类型声明。
 *
 * 让 Electron 模块内部获得 preload 暴露 API 的类型提示。
 * 前端有自己独立的类型定义，不跨包导入本文件。
 *
 * 安全约束：
 * - contextIsolation: true
 * - nodeIntegration: false
 * - preload 只暴露白名单 API（DesktopApi）
 * - 渲染进程不直接访问文件系统
 */
declare global {
  interface Window {
    desktopRuntime: DesktopRuntime
    desktop: DesktopApi
  }
}

export {}
