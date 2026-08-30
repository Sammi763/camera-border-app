# 发布验收清单（打包产物与干净机器验证）

> 适用范围：`pnpm run package` 产出的 macOS arm64/x64 `.dmg` 与 Windows x64 `.exe`。
> 打包链路见 [CONTRIBUTING.md](../CONTRIBUTING.md)；架构约束见 [ARCHITECTURE.md](../ARCHITECTURE.md)。
> 产品契约唯一权威见 [docs/prd.md §0](prd.md)；本清单只记录如何验收，不扩展支持范围。

## 0. 产品契约门槛（阶段 0 冻结）

发布前不得把“代码路径存在”写成“产品支持”。最终发行平台、输入/输出格式、三个导出
档位和术语必须与 [docs/prd.md §0](prd.md) 一致：

- 平台仅为 macOS arm64、macOS x64、Windows x64。
- 输入为 JPEG、PNG、TIFF、HEIC/HEIF，以及只读取内嵌 JPEG 预览的 RAW。
- 输出为 JPEG 8-bit、PNG 8/16-bit、TIFF 8/16-bit。
- 快速分享：JPEG 92、长边 2048、sRGB、移除 GPS/位置。
- 标准交付：JPEG 95、原图尺寸、8-bit、保留源 ICC 和全部元数据，包含 GPS/位置。
- 高保真归档：TIFF、原图尺寸、源位深、源 ICC 和全部元数据，包含 GPS/位置。
- PNG 必须作为同档位格式变体提供：快速分享/标准交付为 PNG 8-bit，高保真归档为按源位深的 PNG 8/16-bit；不新增 PNG 档位。
- RAW 不做真实显影；没有可读取内嵌 JPEG 时必须明确失败。
- 修图、云同步、登录、自动更新和真实 RAW 显影不属于产品范围。

只有三种最终平台均通过下方安装、离线和样片验收，格式、位深、ICC 和元数据才可标记
为“正式支持”；否则只能记录为“当前已实现”或“未验收”。

## 验收分阶段

### T-05A：Windows 打包实现验收

在 macOS 开发机完成 workflow、electron-builder、打包脚本、图标、产物校验、Windows
冒烟脚本和相关测试/文档的实现验收。必须通过仓库规定的本地命令、脚本合成测试、范围
审计和 `git diff --check`；不宣称 Windows 原生安装或真实用户路径已通过。

```text
STAGE: T-05A Windows packaging implementation
VERDICT: PASS
WINDOWS_NATIVE_ACCEPTANCE: DEFERRED_EXTERNAL
NEXT_STAGE_ALLOWED: yes
```

### T-05B：Windows 平台验收

由外部 Windows x64 runner、云主机或其他验收方执行。触发最终 HEAD 的
`windows-package.yml`，配置 `RUNTIME_SHA256_WIN_X64`，保存 workflow URL、构建日志、
冒烟日志和 installer，并按下方「干净机器验证」完成安装、启动、导入、预览、导出、
重启、断网、中文/空格路径及卸载验收。没有 Windows runner 时保持 `BLOCKED`，不得用
macOS 交叉构建结果冒充原生通过。

```text
STAGE: T-05B Windows native acceptance
VERDICT: PASS | BLOCKED
WINDOWS_RUN_URL: ...
NATIVE_INSTALL_SMOKE: pass | not-run
REAL_USER_PATH: pass | not-run
NEXT_STAGE_ALLOWED: yes | no
```

## 1. 打包前检查

- [ ] `bash scripts/fetch-runtime.sh` 已下载目标平台 Java Runtime
  （macOS arm64 / macOS x64 / Windows x64，至少覆盖当前构建目标）；
- [ ] `cd java-engine && mvn test` 全量通过；
- [ ] `pnpm --filter frontend typecheck && pnpm --filter frontend test` 全量通过；
- [ ] `pnpm --filter electron typecheck` 通过。
- [ ] `electron/electron-builder.yml` 为 macOS 使用 `build/icon.icns`、Windows 使用 `build/icon.ico`；
      `pnpm test:scripts` 已校验图标资源存在且格式有效。

## 2. 构建与 T-05A 实现检查

Windows 正式测试包应在原生 Windows x64 runner 或 Windows x64 构建机上生成；仓库提供
`.github/workflows/windows-package.yml` 手动构建流程。T-05A 可在 macOS 上检查
配置与资源契约，但 macOS 上的
`TARGET_OS=win ARCH=x64 pnpm run package` 只作为本地资源/配置检查，交叉构建结果不能替代
Windows 安装验收。

```bash
pnpm run package          # 每次一个架构：macOS 用 ARCH=arm64 或 ARCH=x64
# Windows 原生 x64 构建机：
TARGET_OS=win ARCH=x64 bash scripts/package-app.sh
                          # （Windows 随包 JRE 固定为 x64）
```

正式发布下载 Runtime 时还应启用完整性校验：

```bash
REQUIRE_RUNTIME_SHA256=1 \
RUNTIME_SHA256_MACOS_ARM64=<64位SHA-256> \
pnpm fetch:runtime
```

多平台构建时为每个目标分别提供对应的 `RUNTIME_SHA256_*`，不能依赖开发模式下的跳过提示。

- [ ] Windows 交付目录只包含一个 `Camera-Border-Setup-<version>-x64.exe`，并生成同名
      `.sha256` 与 `.manifest.json`；不向测试用户发送 `win-unpacked`、`.blockmap` 或源码；
- [ ] Windows 安装器输出于 `electron/release/win-x64/`，macOS 产物输出于对应平台目录；
- [ ] 冒烟测试通过（启动应用 → 随包 JRE 启动托管引擎 → 健康端点就绪）：

```bash
# macOS arm64 示例；本机 8099 被占用时用 CAMBORDER_SMOKE_PORT 换端口
hdiutil attach "electron/release/Camera-Border-0.1.0-arm64.dmg" -nobrowse
cp -R "/Volumes/Camera Border 0.1.0-arm64/Camera Border.app" /tmp/
hdiutil detach "/Volumes/Camera Border 0.1.0-arm64"
CAMBORDER_SMOKE_PORT=8091 bash scripts/smoke-test.sh "/tmp/Camera Border.app/Contents/MacOS/Camera Border"
```

### 阶段 1：打包应用 E2E（必须使用真实产物）

当前 macOS 开发机的阶段 1 验收命令（只覆盖当前 CPU 架构）为：

```bash
pnpm package && pnpm e2e:packaged
```

该 E2E 会启动实际打包应用的可执行文件，确认随包 JRE 存在（macOS 为
`resources/java-runtime/Contents/Home/bin/java`，Windows 为 `resources/java-runtime/bin/java.exe`）
并由托管 `JavaBridge` 启动；它不启动 Vite、不连接系统 Java，也不把开发端口注入应用。固定样片默认使用 `photos/78330006.jpg`，可用绝对路径通过
`CAMBORDER_E2E_SAMPLE` 覆盖；导出文件默认写入隔离临时目录，可用
`CAMBORDER_E2E_OUTPUT` 覆盖。

这条命令的成功结果只记录当前 macOS 架构的阶段 1 验收；它不表示 macOS x64 或 Windows
x64 已实测。两个平台仍须在各自原生环境按同一命令完成独立验收。

- [ ] 页面地址为 `app://app/...`，不是 `http://localhost` 或 Vite 地址；
- [ ] 页面运行时只看到 `engine.managed=true`，Renderer 没有 JavaBridge 绝对地址；
- [ ] 健康检查、预览、缩略图和导出请求均记录为 `app://app/api/**` 或
      `app://app/previews/**`；
- [ ] E2E 完成「导入固定样片 → 默认自动应用摄影信息卡 → Canvas 实际照片像素超过门槛 →
      应用零边框版式 → 导出」，并验证输出文件存在、非空且为合法的 JPEG、PNG 或 TIFF；
- [ ] E2E 在应用允许的最小窗口尺寸下确认照片仍可见，或显示「预览区域不足」；不得出现
      「引擎预览已同步」但只有纯边框画布的假成功状态；
- [ ] 失败时保留 `CAMBORDER_E2E_KEEP_TEMP=1` 的临时用户数据和应用日志，用于定位打包问题；
- [ ] macOS arm64、macOS x64、Windows x64 分别在对应原生环境执行；一个平台通过不能替代
      其它平台验收。

### 真实构建记录（2026-08-24，macOS arm64 开发机）

| 项 | 结果 |
|---|---|
| `Camera-Border-0.1.0-arm64.dmg` | ✅ 已生成（英文名称；真实干净机验收待做） |
| `Camera-Border-0.1.0-x64.dmg` | ✅ 已生成（英文名称；真实干净机验收待做） |
| `Camera-Border-Setup-0.1.0-x64.exe` | ✅ 已由 macOS 交叉生成；原生 Windows x64 安装/运行验收待做 |
| RAW 原生显影程序随包 | ⛔ 不属于产品范围；验收只检查读取内嵌 JPEG 预览 |

### macOS 签名结论（实测）

- afterPack 钩子对嵌套 framework/helper 与外层 `.app` 做 ad-hoc 签名；
- **绝不重签 `Resources/java-runtime`**：`--deep` 会把 Temurin JRE 的原始
  hardened-runtime 签名覆盖为 ad-hoc，触发内核 SIGKILL（exit 137），已实测定位；
- 正式分发前替换为开发者证书签名 + 公证。

### 代码签名（环境变量驱动，`electron-builder.yml` + `scripts/package-app.sh`）

正式签名**不需要改配置**，构建时提供证书环境变量即可：

- **macOS**：`CSC_LINK`（Developer ID Application 证书 `.p12`）+ `CSC_KEY_PASSWORD`
  自动签名；公证另设 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`。
- **Windows**：如未来需要正式签名，可设置 `CSC_LINK` + `CSC_KEY_PASSWORD`（EV/OV
  代码签名证书）自动签名 NSIS；本轮明确不配置证书。
- 未配置证书时 `package-app.sh` 对 macOS 显式传 `--config.mac.identity=null`
  （本地未签名 + afterPack adhoc）；`afterPack` 钩子**仅当对产物 `codesign -dv`
  确认正式发布签名（Authority=Developer ID Application）时才跳过
  ad-hoc**——APPLE_ID 只是公证账号，不代表应用已签名；未真正签名时必须仍走 ad-hoc，
  避免只设公证账号却产出未签名应用。

> ⚠️ **当前状态**：本轮 Windows 测试包保持未签名，不购买、不申请、不生成自签名证书。
> 在未建立信誉的情况下，Windows SmartScreen 可能显示「Windows 已保护你的电脑」；测试用户
> 可按正常界面点击「更多信息 → 仍要运行」。不关闭 Defender、不加入白名单、不修改安全策略。
> 当前环境没有 Windows，因此无法代替实机记录 SmartScreen 的实际表现；由 Windows runner/干净机
> 验收时记录即可。macOS 当前也没有 Developer ID 证书，macOS 包仍按未签名测试包处理。

## 3. 干净机器验证

目标环境：**无 Node、无 pnpm、无 Python、无 Maven、无 Java、无登录**的干净系统
（建议用全新虚拟机或未装开发工具的物理机）。

下方 Windows 安装、启动、照片流程、断网、重启和卸载条目属于 T-05B；macOS 条目仍按
对应平台单独记录，不计入 Windows 原生验收。

### 安装与启动

- [ ] 双击 `Camera-Border-Setup-<version>-x64.exe` 可完成标准 NSIS 图形化安装；
- [ ] 默认安装到用户级程序目录，不要求管理员权限；安装器创建桌面和开始菜单入口，
      安装完成后可直接启动；
- [ ] 在 Windows「设置 → 应用 → 已安装的应用」中可以找到 Camera Border 并正常卸载；
- [ ] 安装目录只包含应用自身资源，用户数据保存在 `%APPDATA%\Camera Border`，卸载不主动删除；
- [ ] 不依赖 Node.js、pnpm、Python、Java、Maven、.NET、WebView2 或 VC++ Runtime；
- [ ] 中文 Windows 用户名、中文用户目录及带空格的安装路径可正常安装和启动；
- [ ] 首次启动不要求登录、不联网也能进入主界面（本地优先不变量）；
- [ ] 默认进入「快速出图」模式并显示欢迎页（选择照片 / 拖入照片 / 加载样片 / 价值提示）；
- [ ] **断网验收（Windows 11 实机）**：断开网络后安装并启动，导入 JPEG/PNG 完成
      预览、版式编辑与引擎导出；核心流程与联网时一致。应用运行全程无外网请求。

### 引擎故障双层兜底

应用运行不需要用户安装 Java、Node 或 Python（全部随包）。引擎异常时工作台保持可用，
仅高保真导出被禁用：

- [ ] **引擎启动慢**：引擎就绪前工作台可进入，顶部状态条显示「本地引擎启动中…」，
      不出现全屏错误页；就绪后提示自动消失；
- [ ] **运行时被安全软件阻止**：随包 Java 被 Defender/SmartScreen 阻止时，
      状态条显示 runtime-blocked 分类与白名单指引，「重试」「查看日志」可用。
      注意：只有 EACCES/EPERM 这类明确的「执行被阻止」才显示 runtime-blocked；
      普通 JAR 错误 / Spring Boot 启动失败 / 参数错误（非零退出）显示 start-failed；
      状态条展示的是诊断 IPC 返回的具体原因（而非仅「引擎不可达」）；
- [ ] **端口占用（动态端口）**：默认端口 8099 被其它程序占用时自动换到空闲回环端口
      （日志 `[engine-start] baseUrl=` 可核对），无需手动改配置；生产 `app://` 安全代理
      从当前 JavaBridge 读取实际端口，前端健康检查、预览、EXIF、导出仍全部可用。Renderer
      不读取、保存或拼接绝对引擎地址。**启动时序**：生产窗口在端口探测完成后再创建，
      但 JavaBridge 尚未 ready 时请求返回结构化 `503 ENGINE_STARTING`，UI 显示「本地引擎
      启动中…」；进程真正失败时显示「引擎暂不可用」及诊断原因；重试时若 8099 已释放会
      自动恢复 8099；
- [ ] **退出竞态**：应用退出后 `ps`/任务管理器无残留 Java 进程；退出瞬间即使引擎
      仍在端口探测也不会在退出后 spawn；重试后旧健康探测不会误把新引擎标记为失败；
- [ ] **本地预览兜底**：引擎不可用时 JPEG/PNG/TIFF 队列缩略图与当前预览仍可显示
      （主进程 nativeImage，最大边长 2048、保持纵横比、不放大）；HEIC/HEIF 和 RAW
      走引擎的正式输入链路，RAW 只显示内嵌 JPEG 预览或明确失败，不静默伪装；
- [ ] **预览/导出超时兜底**：引擎进程在但无响应时，预览在有限时间后自动降级本地
      nativeImage、健康检查不永久 pending；导出 POST 在引擎卡死时有限时间后失败并
      提示「导出超时」+ 失败通知（单图/批量不会永久停在「渲染中」）；
- [ ] **导出禁用与恢复**：引擎不可用时导出按钮保留但禁用并显示原因；
      引擎恢复后按钮自动恢复可用；
- [ ] **首屏代理路由**：占用 8099 启动时，窗口出现后的健康检查/预览/EXIF/导出均经
      `app://app/api/**` 或 `app://app/previews/**` 到达实际端口，不出现把旧 8099
      绝对地址暴露给 Renderer 或先直连旧端口再切换的路径；
- [ ] **导出全链路超时**：导出前 EXIF 读取与异步状态轮询同样带可取消超时；
      引擎卡死时不会永久停在「正在读取 EXIF…」或「渲染中…」，最终给出超时/失败提示；
- [ ] **重试锁定**：点击「重试」后按钮保持锁定直到新引擎启动并刷新诊断完成，
      快速重复点击不会终止刚启动的新引擎；
- [ ] **单图导出阶段提示**：准备/渲染阶段显示非确定进度（不伪造百分比），
      长时间渲染不会被误判为卡死；
- [ ] **查看日志**：「查看日志」直接打开 `userData/logs/engine.log` 文件本身；
      日志含 `[engine-start]` 横幅（platform/arch/jar/java/baseUrl）与
      `[engine-exit]`（退出码），可直接反馈给支持方定位问题。

### Windows 日志位置与反馈方式

- 日志文件：`%APPDATA%/<appName>/logs/engine.log`（应用内「查看日志」可直接打开）；
- 反馈时请附上完整 `engine.log`（含 `[engine-start]` 与 `[engine-exit]` 行）、
  Windows 版本与是否安装了安全软件。

### 核心流程（对应验收标准）

- [ ] **10 秒内知道下一步**：欢迎页三个入口清晰可见；
- [ ] **数码 EXIF**：导入数码照片后，拍摄信息摘要自动显示相机 · 镜头，
      来源徽标为「EXIF」，默认版式为「拍摄信息卡」；
- [ ] **拍摄信息预设**：在快速流程中直接创建拍摄信息预设（拍摄画幅 + 相机 + 镜头 + 胶片），
      应用到已选/全部图片后信息条自动补齐 `{Film}`；
- [ ] **三个固定导出档位**：分别验证快速分享（JPEG 92 / 长边 2048 / sRGB / 移除
      GPS/位置）、标准交付（JPEG 95 / 原图尺寸 / 8-bit / 源 ICC + 全部元数据 + GPS/位置）
      和高保真归档（TIFF / 原图尺寸 / 源位深 / 源 ICC + 全部元数据 + GPS/位置）；
- [ ] **PNG 格式变体**：验证快速分享的 PNG 8-bit、标准交付的 PNG 8-bit，以及高保真归档
      按源位深的 PNG 8/16-bit；输出格式选择不改变对应档位的尺寸、色彩和 GPS/位置策略；
- [ ] **四链路一致**：同一张图的 Canvas 即时预览、引擎预览、单图导出、批量导出
      的边框、文字、拍摄信息一致；
- [ ] **缺字段降级**：缺少 EXIF / 胶片时信息条不出现 `undefined`、`null`
      或多余分隔符（如 `· ` 结尾）；
- [ ] **多选作用域**：勾选部分图片后，「已选 N 张」计数准确；拍摄信息预设应用到
      已选范围不影响当前预览图；批量导出按勾选范围执行并在按钮上显示数量；
- [ ] **失败重试**：导出失败时能看到具体文件与错误原因，点「重试失败项」后成功，
      「打开目录」能定位输出目录；
- [ ] **引擎故障页面**：手动结束引擎进程（或占用 8099 端口）后重启应用，
      显示分类后的失败原因，且「重试」「查看日志」可用；
- [ ] **卸载**：卸载后用户数据（版式/资产/拍摄信息预设）保留在 userData，
      重新安装后仍可读取。

### 平台特有检查

macOS：

- [ ] arm64 与 x64 两个 `.dmg` 分别在对应架构机器上冒烟通过；
- [ ] 两个架构均完成 JPEG、PNG、TIFF、HEIC/HEIF 和 RAW 内嵌 JPEG 预览的样片回归；
- [ ] 首次打开 Gatekeeper 提示的处理方式已写入发布说明
      （未签名构建需右键打开或 `xattr -cr`）。

Windows：

- [ ] Windows 10/11 x64 的 `.exe`（NSIS）安装、启动、卸载正常；
- [ ] 原生 Windows 自动冒烟：

```powershell
.\scripts\smoke-test-windows.ps1 -InstallerDirectory .\electron\release\win-x64
```

      脚本只验证随包资源、快捷方式、引擎健康、Java 退出和卸载，不修改 Defender/SmartScreen；
      双击图形化安装、重启 Windows、核心照片流程仍需人工勾选；
- [ ] x64 包在 Intel/AMD Windows 10/11 上通过；Windows ARM64 不属于最终发行目标；
- [ ] 杀毒软件误报情况已记录（如有）。

## 4. 样片回归

样片、格式/位深/ICC/元数据组合和每个导出档位的预期结果统一见
[`docs/test-samples.md`](test-samples.md)。当前 `photos/` 中的文件只是开发样片，不能
替代尚未补齐的 HEIC/HEIF、RAW 失败和 ICC/元数据组合样片。

- [ ] 每个矩阵条目完成「导入 → 预览 → 单图导出 → 批量导出」；
- [ ] 三个平台均验证三个固定导出档位，不用交叉构建结果冒充原生验收；
- [ ] 快速分享移除 GPS/位置，标准交付和高保真归档保留 GPS/位置；
- [ ] RAW 仅以内嵌 JPEG 预览作为图像来源，无内嵌 JPEG 时明确失败；NEF、CR2、CR3、ARW、
      RAF、DNG、ORF、RW2、PEF 九种扩展名各有一正一负真实相机样片；
- [ ] 确认版式、拍摄信息预设、拍摄画幅、边框布局建议四个术语在界面和验收记录中一致；
- [ ] 每次修改渲染/导出相关代码后，确认边框、文字、拍摄信息与预期一致。

## 5. 已知限制

- Windows 当前为未签名 x64 NSIS 测试包，首次下载可能触发 SmartScreen；
- macOS 当前未配置 Developer ID 代码签名与公证；
- 自动更新不在产品范围内；
- 当前 HEIC/HEIF 在 Windows 的正式链路仍待样片验收；最终目标是三种平台均按 §0 支持；
- RAW 不做真实显影，不随包携带或依赖 LibRaw 显影程序，只验收内嵌 JPEG 预览；
- 浏览器降级模式仅用于开发验证，打包产物以 Electron 模式为唯一正式入口。
