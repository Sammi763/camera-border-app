# 发布验收清单（打包产物与干净机器验证）

> 适用范围：`pnpm run package` 产出的 macOS `.dmg` 与 Windows `.exe`。
> 打包链路见 [CONTRIBUTING.md](../CONTRIBUTING.md)；架构约束见 [ARCHITECTURE.md](../ARCHITECTURE.md)。

## 1. 打包前检查

- [ ] `bash scripts/fetch-runtime.sh` 已下载目标平台 Java Runtime
  （macOS arm64 / macOS x64 / Windows x64，至少覆盖当前构建目标）；
- [ ] `cd java-engine && mvn test` 全量通过；
- [ ] `pnpm --filter frontend typecheck && pnpm --filter frontend test` 全量通过；
- [ ] `pnpm --filter electron typecheck` 通过。

## 2. 构建与冒烟

macOS 可通过 `TARGET_OS=win ARCH=x64 pnpm run package` 交叉构建 Windows NSIS，
前提是宿主机有可用 Wine（electron-builder 通常会自动下载兼容工具链）；交叉构建
产物仍需在真实 Windows 机器验收。

```bash
pnpm run package          # 每次一个架构：ARCH=arm64 或 ARCH=x64
                          # （随包 JRE 必须与目标架构一致，脚本按 ARCH 装配）
```

正式发布下载 Runtime 时还应启用完整性校验：

```bash
REQUIRE_RUNTIME_SHA256=1 \
RUNTIME_SHA256_MACOS_ARM64=<64位SHA-256> \
pnpm fetch:runtime
```

多平台构建时为每个目标分别提供对应的 `RUNTIME_SHA256_*`，不能依赖开发模式下的跳过提示。

- [ ] 产物生成于 `electron/release/`，文件名带架构后缀（`-arm64` / `-x64`）；
- [ ] 冒烟测试通过（启动应用 → 随包 JRE 启动托管引擎 → 健康端点就绪）：

```bash
# macOS arm64 示例；本机 8099 被占用时用 CAMBORDER_SMOKE_PORT 换端口
hdiutil attach "electron/release/Camera-Border-0.1.0-arm64.dmg" -nobrowse
cp -R "/Volumes/Camera Border 0.1.0-arm64/Camera Border.app" /tmp/
hdiutil detach "/Volumes/Camera Border 0.1.0-arm64"
CAMBORDER_SMOKE_PORT=8091 bash scripts/smoke-test.sh "/tmp/Camera Border.app/Contents/MacOS/Camera Border"
```

### 真实构建记录（2026-08-24，macOS arm64 开发机）

| 项 | 结果 |
|---|---|
| `Camera-Border-0.1.0-arm64.dmg` | ✅ 已生成（英文名称；真实干净机验收待做） |
| `Camera-Border-0.1.0-x64.dmg` | ✅ 已生成（英文名称；真实干净机验收待做） |
| `Camera-Border-0.1.0-x64.exe` | ✅ 已生成（英文名称；真实 Windows 安装/运行验收待做） |
| RAW 原生程序随包 | ⬜ 未构建（未装 LibRaw 工具链；引擎自动降级嵌入预览并提示） |

### macOS 签名结论（实测）

- afterPack 钩子对嵌套 framework/helper 与外层 `.app` 做 ad-hoc 签名；
- **绝不重签 `Resources/java-runtime`**：`--deep` 会把 Temurin JRE 的原始
  hardened-runtime 签名覆盖为 ad-hoc，触发内核 SIGKILL（exit 137），已实测定位；
- 正式分发前替换为开发者证书签名 + 公证。

## 3. 干净机器验证

目标环境：**无 Node、无 pnpm、无 Python、无 Maven、无 Java、无登录**的干净系统
（建议用全新虚拟机或未装开发工具的物理机）。

### 安装与启动

- [ ] 双击安装包可完成安装，无需管理员权限之外的环境依赖；
- [ ] 首次启动不要求登录、不联网也能进入主界面（本地优先不变量）；
- [ ] 默认进入「快速出图」模式并显示欢迎页（选择照片 / 拖入照片 / 加载样片 / 价值提示）。

### 核心流程（对应验收标准）

- [ ] **10 秒内知道下一步**：欢迎页三个入口清晰可见；
- [ ] **数码 EXIF**：导入数码照片后，摄影信息摘要自动显示相机 · 镜头，
      来源徽标为「EXIF」，默认模板为「摄影信息卡」；
- [ ] **胶片预设**：在快速流程中直接创建摄影预设（画幅 + 相机 + 镜头 + 胶片），
      应用到已选/全部图片后信息条自动补齐 `{Film}`；
- [ ] **四链路一致**：同一张图的 Canvas 即时预览、引擎预览、单图导出、批量导出
      的边框、文字、摄影信息一致；
- [ ] **缺字段降级**：缺少 EXIF / 胶片时信息条不出现 `undefined`、`null`
      或多余分隔符（如 `· ` 结尾）；
- [ ] **多选作用域**：勾选部分图片后，「已选 N 张」计数准确；预设应用到
      已选范围不影响当前预览图；批量导出按勾选范围执行并在按钮上显示数量；
- [ ] **失败重试**：导出失败时能看到具体文件与错误原因，点「重试失败项」后成功，
      「打开目录」能定位输出目录；
- [ ] **引擎故障页面**：手动结束引擎进程（或占用 8099 端口）后重启应用，
      显示分类后的失败原因，且「重试」「查看日志」可用；
- [ ] **卸载**：卸载后用户数据（模板/资产/预设）保留在 userData，
      重新安装后仍可读取。

### 平台特有检查

macOS：

- [ ] arm64 与 x64 两个 `.dmg` 分别在对应架构机器上冒烟通过；
- [ ] 首次打开 Gatekeeper 提示的处理方式已写入发布说明
      （未签名构建需右键打开或 `xattr -cr`）。

Windows：

- [ ] `.exe`（NSIS）安装、启动、卸载正常；
- [ ] 杀毒软件误报情况已记录（如有）。

## 4. 样片回归

`photos/` 目录中的内置样片覆盖：带完整 EXIF 的 JPEG、无 EXIF 图片、RAW 嵌入式预览样片。
每次修改渲染/导出相关代码后，用样片跑一遍「导入 → 预览 → 单图导出 → 批量导出」，
确认文字、边框、摄影信息与修改前一致。

## 5. 已知限制

- 未配置代码签名与公证（`identity: null`），正式对外分发前需补充 codesign + notarize；
- 自动更新不在本期范围内；
- 浏览器降级模式仅用于开发验证，打包产物以 Electron 模式为唯一正式入口。
