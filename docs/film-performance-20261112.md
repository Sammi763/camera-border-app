# 底片调参与阶段缓存性能实测（2026-11-12）

> 本记录用于工程回归，不替代 16GB 实机验收。当前机器为 **32GB Apple M2 Pro**，
> 16GB / 24–45MP 安装包验收仍为 `NOT_RUN`，不得用本结果替代。

## 命令

```bash
# 引擎以随包组件启动（真实 RAW、ExifTool、字体均已注入）
cd java-engine
CAMBORDER_LIBRAW_HELPER_PATH=../professional-tools/libraw/macos-arm64/film-raw-helper \
CAMBORDER_EXIFTOOL_PATH=../professional-tools/exiftool/macos/exiftool \
CAMBORDER_COMPONENT_MANIFEST=../professional-tools/components.json \
CAMBORDER_BUNDLED_FONTS_DIR=../professional-tools/fonts \
CAMBORDER_LCMS2_PATH=../professional-tools/lcms/macos-arm64/liblcms2.2.dylib \
mvn spring-boot:run

cd ..
node scripts/performance-smoke.mjs --count 2 \
  --film-sample photos/DSC04875.ARW \
  --film-tuning-count 4 --film-export-count 2
```

## 环境

- 机器：Apple M2 Pro，物理内存 34,359,738,368 B（32GiB）
- JVM：Temurin 21，`maxMemory=8,589,934,592 B`（8GiB）
- 自动预算：`B=4GiB`，`H=4GiB`，`C=1.5GiB`，`safetyMargin=0.25`
- 引擎进程：`camera-border-engine.jar`（源码运行）
- 样片：`photos/DSC04875.ARW`（Sony ILCE-7M5，7008×4672，约 32.7MP）
- 普通链路样片：`fixtures/stage4/real-exif-canon-m03a9518.jpg`

## 普通链路缩小 smoke（两轮，每轮 2 项）

| 指标 | 数值 |
|---|---|
| 启动基线 RSS | 209,584,128 B（199.9MiB） |
| 最终空闲 RSS | 498,761,728 B（475.7MiB） |
| 空闲增长 | 289,177,600 B（275.8MiB）≤ 600MB |
| 两轮空闲增长 | 24,690,688 B（23.5MiB）≤ 600MB |
| 结果 | PASS |

## 底片场景

| 指标 | 数值 |
|---|---|
| 冷缓存预览 | 13,480ms |
| 首次预览后的分析（阶段已预热） | 4,613ms |
| 连续调参预览 | 3,963 / 2,463 / 3,943 / 3,902ms |
| 连续调参分析 | 3,978 / 4,607 / 4,012 / 3,995ms |
| 批量导出 2 项 | 14,417ms |
| 阶段缓存命中率 | 调参后 80.0%，导出后 81.6% |
| 命中/未命中 | 31 / 7（导出后） |
| 缓存字节 | 1,571,586,048 B / 上限 1,610,612,736 B |
| 缓存条目 | 4（raw-linear / base-positive / current-positive 及当前正片变体） |
| 淘汰次数 | 3 |
| 底片场景峰值 RSS | 2,957,754,368 B（2.76GiB） |
| 底片场景结束 RSS | 2,957,754,368 B（2.76GiB） |

## 结论与边界

- 连续修改正片曝光时，`raw-linear` 与 `base-positive` 命中，未重复 RAW 解码和基础转正；
  命中率与阶段计数来自 `GET /api/film-stage-cache`，不是推测。
- 冷缓存预览包含 `--probe` 尺寸探测、RAW 解码、基础转正、正片、预览合成与 PNG 编码。
- 阶段缓存按设计保留全幅浮点结果，因此底片场景的 RSS 高于普通链路；预算租约在每次
  请求结束时释放，缓存字节计入 H，不额外叠加。
- **当时未执行 16GB 实机、24–45MP 安装包及独立进程内存测量**（后续复核见下节），
  状态保持 `NOT_RUN`；需要在 16GB macOS arm64 目标机按
  [release-checklist.md](release-checklist.md) 重新记录，不能用本 32GB 结果替代。
- 上述历史运行只测了 Java RSS；独立进程 RSS 已在下方复核中补测，不能将历史数值与新包数据混合。

## 安装包 E2E 响应式结果（2026-11-12）

- 应用包：`electron/release/macos-arm64/Camera-Border-0.1.0-arm64.dmg`
  （SHA-256 `0ef2eab3bf7a696e4d54a3765a296edfdc9470e9aad43100ea4127a02fc85868`）。
- 物理屏幕：1512×863；1920×1080 使用 CDP 视口模拟，并在证据 JSON 标注 `emulated: true`。
- `1200×760`：预览 `524×520`（阈值 `520×480`）。
- `1400×863`：预览 `724×560`。
- `1920×1080`（模拟）：预览 `1244×830`。
- `pnpm e2e:packaged` 最终结果：PASS；覆盖 HEIC/RAW/JPEG、三档导出、100 项批量与取消、
  引擎重启、CSP/网络断言、主题对比度和源图 SHA-256。
- 此节为复核前的历史包记录；当前包和独立进程测量见下节。16GB 结论仍为 NOT_RUN。


## 本次复核：安装包独立进程内存采样

- 最终包 SHA-256：`3bc418535804d1cd669ca19b6591c38a3fb3ed776fec5f7a31a0cb9c19c5947b`。
- 从该 DMG 只读挂载并复制到独立安装目录，使用独立用户目录和空闲端口启动；采样只包含本次应用的进程树。
- 使用随包 JRE、同一份 32.7MP ARW；该照片仅用于工程性能测量，不证明真实彩负还原质量。
- 普通链路两轮各 2 项、底片调参 4 次、导出 2 项；这是缩小 smoke，不是默认两轮百图内存验收。
- 证据：[进程内存 JSON](../.local/review-20261112/process-memory-final.json)、[性能日志](../.local/review-20261112/process-memory-final.json.log)。
- 四类进程均已观测；100ms 周期采样可能漏过短时尖峰，数值为**观测峰值**，不是操作系统记录的生命周期精确峰值。RSS 可能含共享页，不能等同唯一物理占用。

| 角色 | 观测峰值 RSS |
|---|---|
| Electron 主进程 | 164,446,208 B（156.8 MiB） |
| Renderer | 135,659,520 B（129.4 MiB） |
| 随包 Java | 3,398,664,192 B（3241.2 MiB） |
| LibRaw helper | 542,441,472 B（517.3 MiB） |

同一时刻的进程树 RSS 合计最大值为 3,892,068,352 B（3.62 GiB），未将各角色不同时刻的峰值相加。

本次首次预览前阶段缓存为空，冷预览 17,010ms；后续曝光调整预览 1,690–2,138ms，分析 1,368–1,467ms。
底片阶段 Java RSS 峰值现按阶段内样本最大值计算，修复了原先用全程峰值之差冒充阶段峰值的问题。
已有缓存时脚本标注 NON_EMPTY，不把首次请求命名为冷缓存结果。

### 复核后的安装包 E2E

- 上述最终 DMG 的安装副本通过完整 `pnpm e2e:packaged`；[结果 JSON](../.local/review-20261112/e2e/packaged-e2e-result.json) 保存包清单哈希、实际窗口尺寸和模拟标记。
- 1200×760 预览为 524×536；1400×863 为 724×560；1920×1080 模拟视口为 1244×830（物理屏幕可用尺寸 1512×865）。
- 紧凑样式移到通用样式之后，并断言元信息栏实际高度 24px、控件绝对定位，避免仅检查源码却漏掉覆盖。
- 修复 Canvas 未清理上一帧的残影：切换窄构图时旧照片不再透出；无效构图也必须清空全幅物理像素。相关回归见 `canvasRenderer.test.ts`。
- 修复调度竞态：迟到旧代次不得移除已经排队的新代次；回归见 `FilmTaskSchedulerImplTest`。
- UI 百图使用独立小型 PNG 验证导出、取消、懒加载和 URL 释放；不冒充百张高像素 RAW 内存验收。

**仍未完成：16GB 实机安装包验收、24–45MP 多份真实 RAW/负片样片覆盖、默认两轮百图引擎内存验收。**
独立进程采样可在当前 32GB 机器执行，已补测，不属于 16GB 硬件阻塞项。

## v2 / LittleCMS 回归（2026-11-12）

- 随包 LittleCMS 2.19 `liblcms2.2.dylib` 在 macOS arm64 安装包内由能力探测报告 `available=true`，SHA-256 与 `lcms2.json` 一致；32/16-bit profile 转换使用 `TYPE_RGB_FLT`，不先量化到 8-bit。
- FFF 合成 TIFF 的 300×600 分块读取与全尺寸 16-bit 导出在 `FilmFlextightReaderTest` 通过；真实 Flextight、约 8080 万像素长条扫描、Windows/macOS x64 安装后性能和内存仍未执行，状态 `NOT_RUN`。

### 真实 FFF 安装包补充

修复后 macOS arm64 包完成 4795×16857 真实 FFF 的预览、分析与连续两图原尺寸 TIFF16 导出；250ms 采样的进程树观测峰值约 6.69 GiB。独立标签表、ICC、像素条带 SHA 与源未变化核验通过。该结果显式假设输入域，不是 FFF 物理校准，也不代替 16GB/Windows/Intel 实机验收。完整证据与限制见 [校色实施复核](film-color-review-20261112.md)。
