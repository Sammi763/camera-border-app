# electron

桌面壳模块，负责窗口生命周期、系统能力、启动和管理本地 Java 引擎。

## 脚本

| 命令 | 用途 |
|---|---|
| `npm run dev` | 开发模式：连接外部 java-engine（IDEA 启动）+ Vite dev server（:5173），不启动 jar |
| `npm run dev:managed` | 托管模式：Electron 自行启动 jar，加载 frontend/dist，不依赖外部 Vite |
| `npm run typecheck` | 仅做类型检查，不输出产物 |
| `npm run build` | 编译 TypeScript 到 dist/ |

## 安全约束

- `contextIsolation: true`
- `nodeIntegration: false`
- preload 仅暴露白名单 API（`window.desktop`）
- 渲染进程不直接访问文件系统
