# 液态玻璃工作台验收记录（2026-11-10）

基线：`0641bf9` 加本次工作区未提交改动。改动归属 `frontend`，未修改 API、DTO、`RenderRecipe` 或导出语义。
设计规范见 [DESIGN.md](../DESIGN.md)，实现说明见 [frontend/README.md](../frontend/README.md)。

> 证据分两轮：第 1–4 节为**第一轮证据（2026-11-10 15:26–15:36）**；第 5 节为同日后续的**第二轮收口（2026-11-10，晚于第一轮）**。
> 第二轮结果见第 5 节；第一轮证据仍保留，不与第二轮截图或命令输出混用。

## 1. 自动化验证（第一轮：2026-11-10）

| 命令 | 结果 |
|---|---|
| `pnpm --filter frontend typecheck` | 通过 |
| `pnpm --filter frontend test` | 通过（测试文件/用例数会随迭代变化，以 CI 结果为准） |
| `pnpm --filter frontend build` | 通过：Vite 生产构建成功（体积数字随代码变化，以 CI/构建输出为准） |
| `pnpm --filter electron typecheck` | 通过 |

Vitest 输出仍有 jsdom 未实现 `HTMLCanvasElement.getContext()` 的提示；测试通过不代表真实像素渲染一致，
照片几何与导出保真仍以既有的 Canvas/Java 一致性测试和实机验证为准。

## 2. 浏览器验证（第一轮：2026-11-10）

环境：macOS，Chrome Dev headless，1400×920 与 1000×820；另在应用内浏览器 656×655（DPR 2）复核；
Vite 开发服务器 + 本地 Java 引擎（8099）加载 9 张样片。浏览器模式没有 Electron 文件桥接。

| 检查项 | 结果 | 证据 |
|---|---|---|
| 新用户默认跟随系统 | 通过：`data-theme="system"`，模拟浅色系统得到 `#f4f6fa` / `#007aff` / `color-scheme: light` | [欢迎页浅色](ui-glass-20261110/welcome-light.jpeg) |
| 深色 / 浅色玻璃切换 | 通过：两套 token 与面板材质正常 | [浅色工作台](ui-glass-20261110/workspace-light.jpeg)、[深色工作台](ui-glass-20261110/workspace-dark.jpeg) |
| 已保存主题偏好 | 通过：新增单测确认 `localStorage.workspace.theme=dark` 优先于默认跟随系统 | `WorkspacePage.test.tsx` |
| 宽屏三栏 | 通过：1400×920 下顶栏 1376×56、左 280、中 672、右 400、Dock 1376×64；无横向溢出 | 上述宽屏截图 |
| 面板圆角与玻璃 | 通过：侧栏 / Dock 20px，抽屉 / 弹窗 24px；玻璃 68%/84%、`blur(20px)`、高光边缘 | 计算样式实测 |
| 照片区域不受玻璃影响 | 通过：`.previewFrame` 与 `.previewCanvasWrapper` 的 `filter`、`backdrop-filter` 均为 `none` | 计算样式实测 |
| 字号与字体 | 通过：正文/队列名/Dock 状态 14px，系统无衬线字体；参数使用等宽数字 | 计算样式实测 |
| 页签底座 | 通过：240ms spring；切到「输出」后指示底座与选中页签 x 坐标一致 | [输出页签](ui-glass-20261110/workspace-light.jpeg) |
| 页签内容淡入 | 通过：220ms `glassTabIn` | 计算样式实测 |
| 按钮按压 | CSS 规则为按下 `scale(0.97)`、90ms，松开 220ms spring；本轮未做逐帧录屏 | `styles.css` |
| 抽屉 | 通过：300ms `glassDrawerIn`，焦点进入抽屉，Escape 关闭且焦点回到「管理用户版式」 | [抽屉](ui-glass-20261110/drawer-light.jpeg) |
| 弹窗 | 通过：240ms `glassModalIn`（0.97→1），焦点在弹窗内 | [快捷键弹窗](ui-glass-20261110/shortcut-dialog-light.jpeg) |
| 窄窗口 | 通过：1000×820 下按 预览 → 队列 → 检查器 纵向堆叠，无横向溢出 | [窄窗口](ui-glass-20261110/workspace-narrow-light.jpeg) |
| 空队列欢迎页 | 通过：选择照片 / 样片入口、拖入提示、价值卡片完整 | [欢迎页](ui-glass-20261110/welcome-light.jpeg) |
| 长队列 | 通过：40 张样片队列可滚动，筛选行出现，可见范围缩略图懒加载（首屏 4 个、滚动后 2 个可见项已加载） | [长队列](ui-glass-20261110/long-queue-40-light.jpeg)、[滚动后](ui-glass-20261110/long-queue-40-scrolled.jpeg) |
| 减少动态效果 | 通过：`prefers-reduced-motion: reduce` 下页签底座与内容面板动画为 `none`、过渡 `0s` | 计算样式实测 |
| 控制台 | 仅 1 条 favicon 404，无 JavaScript 异常 | Chrome Log |
| Lighthouse（工作台加载后） | 无障碍 100、Best Practices 100；SEO 60（缺少 meta description / robots.txt，桌面应用不依赖搜索引擎） | 应用内浏览器 Lighthouse |
| 失败路径 | 由既有测试覆盖：导入去重/失败提示、预览空间不足、引擎不可用禁用导出、导出失败与重试、`unconfirmed` 重新查询 | `QueuePanel.test.tsx`、`PreviewPanel.test.tsx`、`ExportDock.test.tsx`、`useExportController.test.tsx` |

说明：欢迎页和长队列截图来自同一 Chrome 版本与 Vite 构建；长队列使用临时样片目录验证，验证后已恢复原 9 张样片。

## 3. Electron 实机验证（第一轮：2026-11-10）

| 命令 | 结果 |
|---|---|
| `pnpm --filter electron typecheck` | 通过 |
| `pnpm --filter electron dev` | **未通过（本地运行时问题）** |

失败环节：`scripts/prepare-electron-dev.mjs` 的 macOS 本地 Electron 签名修复：

```text
Electron.app: replacing existing signature
Electron.app: bundle format is ambiguous (could be app or framework)
In subcomponent: .../Electron Framework.framework
[electron-dev] Electron 开发运行时签名校验失败，请重新执行 pnpm install
```

另尝试绕过准备脚本直接启动开发 Electron；进程未建立可连接的远程调试端口并退出，随后本地
`node_modules` 内 Electron.app 被运行环境删除（ENOENT）。已重新执行 Electron 官方 `install.js`
恢复本地开发运行时。该问题发生在本机 `node_modules` 运行时，不涉及源码或打包脚本。

因此本轮**未完成** Electron 实机窗口、原生文件选择、真实导出、macOS 窗口材质与系统主题切换验证。
这些需要在修复本地 Electron 运行时后另测，不能由浏览器结果替代。

## 4. 未覆盖项（第一轮：2026-11-10）

- Electron 实机窗口与系统级文件对话框。
- 真实文件的单图/批量导出、失败重试与输出目录核对。
- 读屏器、键盘全流程逐控件走查与逐帧动效录制。
- 真实摄影用户的视觉与动效偏好访谈。
- 长时间大队列性能与内存压测。

## 5. 第二轮收口（2026-11-10）

本轮收口覆盖工作台四项 UI 任务：**模板、队列、页签、样式与背景**。浏览器采集时间为 2026-11-10 17:00–20:10，晚于第一轮的 15:26–15:36；Electron 实机采集于同日晚间。结果以实际命令输出与截图为准。

### 5.1 自动检查

| 命令 | 结果 |
|---|---|
| `pnpm --filter frontend typecheck` | 通过 |
| `pnpm --filter frontend test` | 通过（605 个用例；数量会随迭代变化，以 CI 为准） |
| `pnpm --filter frontend build` | 通过（Vite 生产构建成功） |
| `pnpm --filter electron typecheck` | 通过 |
| `git diff --check` | 通过，无空白错误 |

Vitest 仍有 jsdom 未实现 `HTMLCanvasElement.getContext()` 的既有提示；测试通过不代表真实像素渲染一致。

### 5.2 模板（样式页签版式画廊）

| 验收点 | 结果 |
|---|---|
| 默认只展示精选版式，可通过「展开全部版式」切换；展开偏好跨会话保持 | 通过：localStorage 持久化测试通过；收起时已应用的非精选模板仍保持可见 |
| 默认列表不重复出现摄影信息卡变体，展开后包含全部非变体内置版式 | 通过：网格过滤四个信息卡变体；变体只通过「当前版式设置」切换 |
| 卡片实时缩略图使用当前照片与有效设置，与主预览同源 | 通过：现有 U03 合并/变体测试继续通过 |
| 「应用 / 已应用」状态与推荐徽标随当前版式更新 | 通过：应用、四种变体、输出设置不误清、设置撤销后不显示虚假已应用均有测试 |
| 卡片按钮可 Tab 到达并用 Enter/Space 应用；窄窗口网格不横向溢出 | 通过：全局快捷键不再劫持按钮 Space/Delete；1400/1000/656 无横向溢出 |
| 详情默认收起，展开不触发应用；长说明和字段不撑高首屏 | 通过：详情区默认 hidden；[截图](ui-glass-20261110/second-round/03-template-details-1400-light.jpeg) |
| 「当前版式设置」仅在信息卡已应用时展示，布局/边框互不覆盖 | 通过：1400×920 下分组 344×101px，两个按钮组并排；[截图](ui-glass-20261110/second-round/09-current-layout-settings-1400-light.jpeg) |
| 首屏完整显示两张精简卡片及应用入口 | 通过：1400×920 下两张卡片各 216px 高，应用按钮 bottom 638px，均在右栏可视区内；[截图](ui-glass-20261110/second-round/02-workspace-1400-light.jpeg) |

### 5.3 队列

| 验收点 | 结果 |
|---|---|
| 当前预览项与批量勾选互不改写；当前行淡蓝底+细描边 | 通过：active/checked 独立测试通过；[长队列截图](ui-glass-20261110/second-round/11-long-queue-40-long-names.jpeg) |
| 队列行主体、复选框、删除/定位为独立交互元素 | 通过：主体按钮 aria-label 为文件名，title 含完整路径；无按钮嵌套 |
| 拖拽行降透明、落点虚线、drop/dragEnd 清除 | 通过：现有测试 + 外部文件 drop 不再被行内吞掉 |
| 名称筛选、仅看缺失、排序、右键菜单可用 | 通过：筛选状态在控件消失时复位；右键菜单已 Portal 到 body，1400×920 下完整可见；[截图](ui-glass-20261110/second-round/10-context-menu-1400-light.jpeg) |
| 丢失文件单条/文件夹重定位，同名候选人工确认 | 通过：现有流程保留；IPC reject 有中文错误反馈 |
| 长队列缩略图懒加载，行不叠加 backdrop-filter | 通过：40 张长文件名队列可滚动，首屏 7 个可见缩略图；长文件名单行省略；[截图](ui-glass-20261110/second-round/11-long-queue-40-long-names.jpeg) |
| 1400×920 至少完整显示六个常规条目 | 通过：左栏 280px、列表高 403px、常规行 60px，完整显示 6 行；底部操作 83px，Dock 不遮挡 |
| 「更多」浮层键盘、Escape、外部点击、焦点恢复 | 通过：1400×920 下 208×205px、视口内；Escape 后焦点回「更多」；[截图](ui-glass-20261110/second-round/04-queue-more-1400-light.jpeg) |
| 缺失文件状态 | 通过：缺失横幅、文件丢失徽标、定位按钮、勾选状态均保留；[截图](ui-glass-20261110/second-round/13-missing-file-1400-light.jpeg) |
| 导出失败状态 | 通过：模拟引擎 500 后错误就近显示；[截图](ui-glass-20261110/second-round/14-export-failure-1400-light.jpeg) |

### 5.4 页签（键盘与 ARIA）

| 验收点 | 结果 |
|---|---|
| 仅选中页签 `tabIndex=0`，其余 `-1` | 通过：浏览器实测 `[0,-1,-1]`，方向键后 `[-1,0,-1]` |
| 左右方向键循环并自动激活，Home/End 到首尾 | 通过：组件测试覆盖；浏览器方向键后 active/focus 均为「摄影信息」 |
| 面板内输入控件不被方向键拦截 | 通过：组件测试覆盖 |
| ARIA 关联；只有当前页签设置 `aria-controls` | 通过：当前 tab 与当前 panel 成对，非活动页签无悬空引用 |
| 点击切换与底座动画保留；减少动态效果下无位移 | 通过：240ms spring；reduce 下 animation/transition 为 none/0s；[动效](ui-glass-20261110/second-round/16-tabs-motion.mp4) |
| 空 tabs / 无效 activeTab 安全回退 | 通过：组件测试覆盖 |

### 5.5 样式与背景

| 验收点 | 结果 |
|---|---|
| 浅色 / 深色 / 跟随系统 | 通过：系统浅色 `#f4f6fa/#007aff`，系统深色 `#0d1117/#0a84ff`；[浅色](ui-glass-20261110/second-round/02-workspace-1400-light.jpeg)、[深色](ui-glass-20261110/second-round/06-workspace-1400-dark.jpeg) |
| 预览背景黑 / 灰 / 白只影响界面 | 通过：token 为 `#111111 / #4F4F4F / #F7F7F7`，未进入 RenderRecipe |
| 照片画布不使用玻璃滤镜 | 通过：previewFrame 与 wrapper 的 filter/backdrop-filter 均为 none |
| 玻璃 token 与 DESIGN.md 一致 | 通过：顶栏/侧栏/Dock 20px、抽屉/弹窗 24px、玻璃 68%/84%、blur(20px) |
| 不支持 backdrop-filter 的回退 | 通过：CSS `@supports not` 覆盖主外壳、右键菜单与更多浮层 |
| 减少动态效果 | 通过：页签底座/内容、抽屉/弹窗、更多浮层 animation/transition 关闭 |
| 1400/1000/656 窄窗口 | 通过：1000、656 均按 预览→队列→检查器 堆叠，无横向溢出；[1000](ui-glass-20261110/second-round/07-workspace-1000-light.jpeg)、[656](ui-glass-20261110/second-round/08-workspace-656-light.jpeg) |
| 字号下限 | 通过：正文/控件/页签/字段标签 14px；徽标/元数据 12px；注入 `.presetCategoryChip` 实测 12px |
| Lighthouse（加载工作台） | 无障碍 100、Best Practices 100；仍有 1 条 `label-content-name-mismatch` 建议（无缩略图行的“无预览”未进入 aria-label），SEO 60 不影响桌面应用 |

### 5.6 动效记录

- 按钮按压（真实 CSS `:active`，按下 0.97 / 松开 spring）：[15-press-motion.mp4](ui-glass-20261110/second-round/15-press-motion.mp4)
- 页签切换（底座 240ms + 内容淡入）：[16-tabs-motion.mp4](ui-glass-20261110/second-round/16-tabs-motion.mp4)
- 队列“更多”浮层（160ms 入场、Escape、排序执行）：[17-queue-more-motion.mp4](ui-glass-20261110/second-round/17-queue-more-motion.mp4)

录制使用 1400×920 Chrome，32/28/29 帧，时长约 1.1–2.0 秒；视频仅用于动效手感确认，不替代静态布局截图。

### 5.7 Electron 实机验证

| 检查项 | 结果 |
|---|---|
| `pnpm --filter electron dev` / 本地运行时准备 | 通过：`prepare-electron-dev.mjs` 本次成功，Electron 31 窗口实际启动 |
| 真实窗口与三栏布局 | 通过：1291×840 CSS 视口（DPR 2），左 280 / 中 563 / 右 400，完整显示 6 个队列条目，无横向溢出 |
| 原生桥接 | 通过：`window.desktop.checkImagePaths`、`listSystemFonts`（80 个字体）、`getPackageCapabilities` 均可调用；`engine.managed=false` |
| 预览与引擎 | 通过：真实 Electron 窗口内显示「引擎预览已同步」 |
| 浅色 / 深色 / 跟随系统 | 通过：真实窗口切换浅色/深色；模拟系统浅/深色时 `data-theme=system` token 与 `color-scheme` 正确 |
| 原生文件对话框、真实单图/批量导出、系统外观切换 | **未执行**：未通过自动化操作原生对话框；不使用本机 GUI 脚本或修改签名/打包脚本。浏览器模拟的导入/导出失败不能替代桌面验收 |

Electron 截图：[浅色](ui-glass-20261110/second-round/18-electron-light.jpeg)、[深色](ui-glass-20261110/second-round/19-electron-dark.jpeg)。

### 5.8 独立审查与修复

独立只读审查发现 2 个 P1、若干 P2；本轮已完成：

- P1 全局快捷键不再劫持按钮 Space/Delete/方向键；焦点在模板应用、页签、更多菜单等控件时保留原生行为。
- P1 右键菜单从玻璃侧栏 Portal 到 body，修复 backdrop-filter containing block 裁剪；浅/深主题 token 正常。
- P2 筛选控件消失时复位筛选状态；外部文件 drop 不再被行内吞；重定位 IPC reject 有可读反馈；输出设置不再误清模板“已应用”；设置撤销后不保留虚假模板状态；长文件名单行省略且状态徽标不裁切。
- P2 页签非活动项不再产生悬空 `aria-controls`；`.presetCategoryChip` 提升到 12px；导出状态多 span 增加可换行间距；重复的右键菜单/页签头/画廊样式已合并。
- 仍保留的已知项：父级 `workspaceTabs` 仍随 `queue` 对象重建内容，但 `TemplateGallery`/`TemplateCard` 已 memo 化，缩略图按 IntersectionObserver 绘制；未做更大范围性能重构。Lighthouse 的 `label-content-name-mismatch` 建议（无缩略图行的“无预览”未进入 aria-label）；Electron 原生对话框/真实导出未自动化。

## 6. 第二轮后复核与补修（2026-11-10 20:40–20:52）

本节基于第 5 节交付后的现有工作区增量修复；保留起始未提交工作，仅修改前端组件、对应测试、样式及说明文档。
未修改 Electron／Java 源码、API、DTO、RenderRecipe 或导出行为。

### 6.1 确认问题与补修

- 跨队列／设置连续撤销后，重做错误地优先选取较大的原始序号；改为优先恢复较小序号，补两种跨栈操作顺序的失败回归再修复。
- 左右分栏手柄的方向键与分隔线实际移动方向相反；修正两侧增减方向，测试覆盖 Shift 加速、Home 与上下限。
- 筛选无匹配后恢复列表时，重新挂载的队列行未注册 IntersectionObserver；过滤与观察器共用同一份可见列表。保留仍可见行的 ID，避免异步观察空窗释放缓存、重复解码。
- 队列主体按钮不再以文件名 `aria-label` 覆盖完整内容，使用原生可访问名称包含文件名、占位状态与徽标；隐藏的旧“当前／选择”装饰徽标显式设为 `aria-hidden`。这修正第 5.8 节记录的标签覆盖来源，本次未重新运行 Lighthouse，不沿用旧分数作为新审计结果。
- 信息卡布局与边框的四个按钮补 `aria-pressed`，测试四变体的独立选中态及切到普通版式后设置组隐藏。
- 右键菜单支持 Shift+F10／菜单键打开、焦点进入、上下循环、Home／End、Escape 恢复触发行；目标被移除后关闭。菜单按实际尺寸重新钳制，窗口缩放时更新，过高时滚动。
- 更多浮层首项 Shift+Tab 回到触发按钮，末项 Tab 从触发点按工作台原 DOM 顺序继续；两类浮层在焦点移出或窗口失焦时关闭，不留下后台菜单。

### 6.2 自动与独立审查

前端 typecheck、全量 test、生产 build、Electron typecheck、`git diff --check` 均通过；测试数量以当前 CI／命令输出为准。
Vitest 仍报告 jsdom 不提供 Canvas getContext，不能将组件测试视为真实像素验收。

独立 React、TypeScript 与增量代码审查已完成。审查发现的筛选异步缓存空窗已修复并补测试；最后增量复核无新增待修问题。

### 6.3 本轮真实 Chromium 证据

环境：独立 Chrome Dev headless、本机 Vite 及已有 Java 开发 JAR；与 Electron 原生运行证据分开。
使用独立临时浏览器配置，不改桌面工作会话。

| 检查项 | 本轮结果 |
|---|---|
| 1400×920 浅／深色工作台 | 截图保留三栏与照片中性背景：[浅色](ui-glass-20261110/review-fixes/01-workspace-light.jpeg)、[深色](ui-glass-20261110/review-fixes/03-workspace-dark.jpeg) |
| 右下角菜单 | 实测宽 168、高约 192px，右／下边缘均距视口 8px：[边缘截图](ui-glass-20261110/review-fixes/02-context-menu-edge.jpeg) |
| 右键键盘 | Shift+F10 打开；上下循环、Home 和 Escape 正常；Tab 继续到删除按钮，Shift+Tab 继续到行复选框 |
| 更多 Portal 边界 | 末项 Tab 关闭且焦点留在页面；首项 Shift+Tab 返回更多按钮 |
| 筛选恢复 | 无匹配后清空筛选，恢复真实异步观察并加载可见缩略图 |
| 656×655 深色 | 无页面横向溢出：[截图](ui-glass-20261110/review-fixes/04-narrow-dark.jpeg) |

机器可读结果：[browser-results.json](ui-glass-20261110/review-fixes/browser-results.json)。

### 6.4 保留的验证边界

- 本轮桌面控制工具两次连接超时，因此没有新增 Electron 原生对话框、真实单图／批量导出或实际系统外观切换证据；第 5.7 节的部分 Electron 验证仍有效，未覆盖项不标完成。
- 本轮未重新执行 Lighthouse 或长时间大队列内存压测。
- 未进行父级 workspaceTabs 大范围性能重构；没有发现必须为此次 UI 收口重构架构的证据。

### 6.5 设计检测提示处理（同日后续）

四条提示均标记为来源未知，不作为本轮新增回归统计：

- `side-tab`：旧 3px 单侧选中边框已被后段 1px 样式覆盖；移除旧规则和基础行残留粗边占位，保持当前细描边效果，不添加忽略。
- `layout-transition`：批量进度条改为固定宽度配合 `scaleX`，过渡仅改变 transform；单图非确定进度仍保留原 40% 滑块与位移动画。
- 两条 `bounce-easing`：用户明确要求“毛玻璃q弹风格”，保留轻微回弹。在 `.impeccable/config.json` 仅对 `frontend/src/styles/styles.css` 的 `var(--motion-spring)` 和对应 cubic-bezier 值添加例外，未忽略整个文件或规则；减少动态效果支持保持有效。

本次两文件设计检测返回空列表；前端 typecheck、导出 Dock／预览组件测试、生产 build 和 `git diff --check` 通过。
增量独立审查通过，没有留下待处理的设计提示。本次未重新执行桌面导出或录制新的进度动效。
