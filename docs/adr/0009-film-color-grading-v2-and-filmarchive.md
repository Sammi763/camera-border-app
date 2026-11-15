# ADR-0009：胶片校色 v2 契约与 FilmArchive 只读关联

- 状态：已接受（共享契约与首个纵向切片已实现；真实胶片模型仍按证据门槛）
- 决策日期：2026-11-12
- 前置：[ADR-0007 显式底片数字化模式](0007-explicit-film-digitization-mode.md)
- 参考资料：[FilmArchive 接入方案](../film-color-capability-plan.md)、[胶片校色资料目录](../film-color-catalog.md)、[本机扫描成片参考](../film-color-reference-20261112.md)

## 背景

ADR-0007 的 v1 契约把「输入模式」和「是否彩负」压在同一组字段里：`inputMode=sensor-raw|linear-tiff`
且 `negative` 同时承担转正开关。它能验证真实 RAW 与通用彩负，但无法清楚表达：

- 已转正的扫描成片/数码 RAW 正片应只做基础校正，**不进入反相、片基和密度阶段**；
- 同一来源（例如相机 RAW）既可能是数码正片，也可能是彩负翻拍；
- Flextight FFF 是 TIFF 容器的 RGB16 扫描主图，文件里的输出 Adobe RGB 或历史 gamma
  不能被当成原始扫描输入定义；
- 文献、胶片版本、曲线、处理配置与用户观感配方需要分开保存和追溯。

同时，用户需要只读关联本机 FilmArchive 目录（`catalog.json` + `Docs`），获得资料卡与
受控原文打开，而不是引入上游 WPF 阅读器或联网依赖。

## 决策

### 1. 版本与兼容

- v1（`schemaVersion=1`、`algorithmVersion=film-digitization-v1`）继续接受，字段、处理顺序和
  已保存会话不迁移、不改写。
- v2（`schemaVersion=2`、`algorithmVersion=film-color-v2`）新增 `inputSource` 与
  `filmPolarity`，禁止在同一请求里同时使用 v1 `inputMode`。
- 未知版本、算法版本、来源、正负性质、组合冲突必须明确 4xx，不静默降级成普通模式。

### 2. 输入来源与正负性质分开

`inputSource`：

| 值 | 含义 |
|---|---|
| `camera-raw` | 真实传感器 RAW；普通模式仍只允许内嵌 JPEG |
| `encoded-raster` | JPEG/PNG/8–16-bit TIFF 等已编码栅格 |
| `linear-tiff` | 显式声明线性传递函数的 16-bit TIFF |
| `flextight-fff` | Flextight FFF（TIFF 容器）RGB16 主图 |

`filmPolarity`：

- `positive`：正片/已转正扫描。基础正片就是读入图像，**跳过反相、片基、密度**；
- `color-negative`：彩色负片。必须完整提供 `negative`，沿用光源/片基/密度与通用彩负算法。

`camera-raw + positive` 表示数码 RAW 正片；`encoded-raster + color-negative` 表示扫描负片；
两者不再靠“有没有 negative”猜来源。

### 3. 已编码栅格与 ICC

- `encodedInput.colorSpace` 必填：`embedded | srgb | adobe-rgb | prophoto-rgb |
  linear-srgb | linear-rec2020`；`bitDepth` 只允许 8/16。
- 使用 `embedded` 时必须带 `iccSha256`，读取时与实际嵌入 profile 核对；缺失或不一致明确失败。
- 源文件没有 ICC 时必须显式选择并随配方保存；不得默认猜成 sRGB 后静默处理。
- 透明像素按 `alphaBackground=white|black` 在 float32 线性工作空间合成，不先经过 8-bit 画布。
- 源样本经 ICC/矩阵直接进入线性 Rec.2020；16-bit TIFF 的低有效位不先压成 8-bit。

### 4. Flextight FFF 扫描输入模型

- `flextightInput` 固定 `device=flextight`、`mainImage=rgb16`、`transferFunction=linear`、
  `bitDepth=16`，`colorSpace` 只允许 `linear-srgb` 或 `linear-rec2020`。
- 只读取 image 0 的 RGB16 主图；预览/缩略图/附属 IFD/私有历史不冒充主图，并报告附属图数量。
- 文件内输出 profile、Adobe RGB 或历史 gamma 不作为原始输入定义；用户必须选择输入域。
- 采用 256 行横向分块读取，避免先分配整幅 16-bit BufferedImage；全尺寸导出仍走共享浮点
  合成与 16-bit TIFF/JPEG 编码。约 8080 万像素长条扫描的**真实文件**验收仍为 `NOT_RUN`，
  不得用合成 TIFF 改名 .fff 宣称真实 Flextight 支持。

### 5. 中性区域建议

`POST /api/image-analysis` 增加 `purpose`：

- `histogram`（默认）：现有直方图/区域统计；
- `neutral-balance`：强制从 `base-positive` 取样，过滤 `luma<0.05`、任一通道 `<=0` 或 `>=0.98`
  的样本，要求至少 16 个有效样本；返回逐通道中位增益、RGB 平衡 EV、置信度与
  `binding=sha256(sourceVersion|recipeSignature|gains)`。
- 返回值只是建议，不修改配方；源指纹或基础正片签名变化后前端必须丢弃旧建议。

### 6. FilmArchive 只读关联

- 上游基线：`noeltong/FilmArchive` 提交 `3001b382`；只读关联用户本机目录，不复制上游代码、
  不打包 PDF、不依赖 WPF 阅读器、不引入联网运行时依赖。
- `POST /api/film-reference-libraries` 注册目录并解析 `catalog.json`/`Docs`；
  `GET /api/film-references` 查询已索引文献。Electron 只提供目录选择、固定白名单根与受控打开。
- SHA-256 相同的文件合并来源；同一来源不同内容保留为修订，不覆盖旧版；
  正文近似只提示人工复核，不做自动合并或自动晋级。
- `id` 由内容 SHA-256 或目录指纹派生；`upstreamDocumentKey` 只作上游定位，
  **禁止把上游文档 ID/路径当成本项目胶片 ID**。
- 文献与胶片允许多对多关联；胶片 ID 只使用本项目胶片库。文献/胶片/曲线/处理配置/用户观感
  配方分别记录，选择胶片名称或资料卡不会自动修改像素。
- 保留来源、出版号/日期线索、SHA-256、上游提交；未知来源标记 `unknown-source`；
  `hidden` 与来源类型不代表在售状态。出版号/日期若只能从文件名启发式得到，明确标记
  `filename-or-url-heuristic`，不写成已核实事实。
- 资料刷新返回 added/removed/changed/newRevisions；不改变已编辑图片和已冻结导出。

### 7. 接口与错误

| 接口 | 用途 |
|---|---|
| `POST /api/image-probe` | 只读头部/来源事实；导入、恢复、重新定位、预检共用 |
| `POST /api/image-analysis` | `purpose=histogram\|neutral-balance` |
| `POST /api/film-reference-libraries` | 注册/刷新本机 FilmArchive |
| `GET /api/film-references` | 检索已索引文献 |
| `GET /api/film-reference-index` | 随安装包分发的冻结研究索引（来源链接/别名/缺口；不含 PDF） |

v2 新增稳定错误码：`IMAGE_PROCESSING_INVALID_INPUT_SOURCE`、`INVALID_POLARITY`、
`INVALID_ENCODED_INPUT`、`INVALID_FLEXTIGHT_INPUT`；探针/资料库另有
`IMAGE_PROBE_*`、`FILM_REFERENCE_*` 码。旧 v1 请求与错误码不变。

## 后果

- 正片扫描可以在同一 `RenderRecipe.imageProcessing` 中完成校色，不再需要伪造 negative
  或把普通 TIFF 谎报为线性输入。
- 预览、分析、单图和批量导出继续共用配方、调度、内存准入、取消与阶段缓存；
  缓存键纳入源指纹、ICC、输入解释、来源/正负性质与算法版本。
- 工作台底片页签可在 v1 真实 RAW/线性 TIFF 与 v2 扫描正片之间共存；资料卡只读展示，
  原文打开路径由 Electron 主进程校验。
- FFF 的真实 Flextight 样本、Windows/macOS x64 安装包、真实 Gold/Portra 模型与
  “8080 万像素真实长条扫描”验收保持 `NOT_RUN`；合成 TIFF 改名测试只证明容器/分块路径。

## 替代方案

- 把「正片」实现成 `negative.enabled=false`：来源与性质仍混在一起，且容易误当成已完成转正，否决。
- 为扫描成片另建一套 DTO/预览/导出链路：违反单一 RenderRecipe，否决。
- 直接把 FFF 内嵌 Adobe RGB/历史 gamma 当输入：会把输出调机结果当原始扫描数据，否决。
- 用上游文档路径或标题当胶片 ID：来源会随目录变化，且无法表达多对多，否决。
- 把 PDF 打包进安装包：许可边界和体积都不可接受；只提供索引、来源链接与本机关联，否决。

## 验证记录（2026-11-12）

| 检查 | 结果 |
|---|---|
| `cd java-engine && mvn test` | 408 项通过；含 v1 兼容、v2 契约/序列化、8/16-bit/灰阶/透明/ICC 失败、FFF 分块与全尺寸导出、中性建议、探针、FilmArchive SHA 合并/修订/差异/越界路径 |
| `pnpm --filter frontend typecheck && pnpm --filter frontend test -- --run` | typecheck 通过；78 文件 / 695 项通过 |
| `pnpm --filter frontend build` | 通过，Vite 产物生成 |
| `pnpm --filter electron typecheck && pnpm --filter electron test -- --run` | typecheck 通过；16 文件 / 154 项通过 |
| `pnpm test:scripts` | 通过（含安装包资源校验） |
| `ARCH=arm64 bash scripts/package-app.sh` | DMG、blockmap、manifest、SHA-256 生成；安装包内包含 LibRaw helper 与 LittleCMS 2 |
| 安装包冒烟 `scripts/smoke-test.sh` | macOS arm64 应用启动、随包 JRE、`/api/health` 通过 |
| 安装包 `/api/capabilities` | `lcms2.available=true`、版本 2.19、SHA-256 与清单一致；`filmDigitization.inputSources` 含 4 类；`schemaVersions=[1,2]` |
| 安装包 `/api/image-probe` | 真实 `photos/78330006.jpg` 返回 5035×3339、嵌入 ICC SHA；真实 `photos/DSC04875.ARW` 返回 Sony ILCE-7M5、7168×5120、14-bit、LibRaw 可用 |
| 安装包 `/api/film-reference-index` | 冻结研究索引可读：404 条材料记录、352 个来源、7 个别名、24 个缺口；不含 PDF |
| 本地 FilmArchive 快照 | GitHub 仓库目录与旧网站目录采用兼容适配，路径/字段/基线见 [上游复核](../filmarchive-upstream-baseline-3001b382.md)，缺失文件不得伪造正文 |
| macOS x64 包 | 产物生成；在本机 arm64 环境启动冒烟未通过，状态 `NOT_RUN`，不得写成正式支持 |
| Windows x64 包 | NSIS 产物已生成且校验含 `professional-tools/lcms/win-x64/lcms2.dll`（PE x64，SHA-256 匹配）；未在 Windows 实机启动/断网/ICC 验收，状态 `NOT_RUN` |
| 真实 Flextight / 长条扫描 / 专属模型 | 真实大图原尺寸处理链路已通过；物理输入域与专属模型未通过，见实施复核 |

安装包证据路径：`electron/release/macos-arm64/Camera-Border-0.1.0-arm64.dmg`；冒烟与能力输出见本轮终端记录。

## 后续复核修订

本轮完成记录的边界、修复与真实 FFF 本机证据以[实施复核](../film-color-review-20261112.md)为准。真实 FFF 并非缺失：原始读写已执行；安装包原尺寸全流程已通过；输入域物理校准及跨平台实机验收仍需完成。中性建议改为保留亮度，超范围拒绝、不硬截断，并要求有效样本至少占一半。
