import { registerAppSchemePrivileged } from "./protocol.js"
import { runApplication } from "./appLifecycle.js"

// 必须在 app ready 之前注册，使协议表现为标准协议——
// 否则前端 dist 中的根绝对路径资源无法正确解析。
registerAppSchemePrivileged()

// 启动应用生命周期：单实例锁、窗口创建、引擎管理、IPC 注册。
runApplication()
