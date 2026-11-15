# 胶片校色 v2 实施复核（2026-11-12）

本轮对工作区实现做代码复核、修复和回归；原有安装包及其哈希属于修复前产物，不能作为本轮修复后的发布证据。

## 已修复

- JPEG 解码器默认可能先按嵌入 ICC 转成 sRGB，原实现再次套用源 ICC。现指定与源 profile 一致的解码目标，保证工作空间转换只应用一次。线性 ICC 灰块回归曾复现约 0.502 被误读为 0.737。
- 编码栅格通过 ColorModel 展开索引色调色板、每通道归一化与预乘透明度，避免把 PNG 索引当灰度；LittleCMS 增加真正单通道 Gray ICC 输入格式。
- LittleCMS 分块传输并检查取消，限制 JNA 临时原生缓冲；编码栅格内存估算计入额外浮点和颜色缓冲。
- FFF 与编码栅格枚举 IFD 使用非顺序读取模式；原先顺序模式调用 getNumImages(true) 会失败并误报只有一个 IFD。
- 补齐 FFF/3FR 的会话恢复及文件版本白名单，扩展主要 RAW 后缀的候选导入路由。候选格式不代表所有机型和压缩方式均已验收。
- RAW helper 对未经映射的非三通道输出明确失败，避免直接截取前三通道造成错误颜色。
- FFF 探测先尝试真实相机 RAW，失败再检测扫描 TIFF 容器；默认配方尊重成功的相机探测，避免所有 FFF 被强制归入扫描来源。
- 中性建议保留当前平衡阶段亮度；超出 ±4 EV 时拒绝建议，不逐通道硬截断。有效样本占比不足一半时拒绝。
- 中性框选显示完整源坐标的基础正片，丢弃切图后的迟到建议；校色入口探测失败不再开启猜测配方，切图后旧探测不写入新图。
- FilmArchive 同时支持旧网站和 GitHub 仓库目录结构，读取 relativePath/docTitle/docType/pageCount/revision/date/sourceKind/productAliases，正确解析根相对 Docs 路径。声明元数据标作 catalog-declared，不等同于正文复核。
- 原文 SHA 与目录声明不符时标记 checksum-mismatch 并禁止打开；来源域使用精确域/子域边界判断，未知来源不默认官方。

## 本机真实 FFF 证据

原完成报告将真实 FFF 列作缺失材料不准确：本机用户图库存在 Flextight X5 文件，另有候选配对 TIFF。

执行入口：`FilmFlextightLocalTest`，只有设置 `FILM_REVIEW_FFF_ROOT` 才运行；照片不入仓库，产物使用测试临时目录。

```sh
FILM_REVIEW_FFF_ROOT='/Users/soysauce/图片/胶片底片' \
  mvn -f java-engine/pom.xml -Dtest=FilmFlextightLocalTest -DargLine=-Xmx6g test
```

本轮执行读取了 9 份真实 FFF 的主图头部和附属图信息，对其中最大的 4795×16857（80829315 像素）完成全幅读取、16-bit TIFF 写出及输出尺寸/位深回读。日志：本机 `/tmp/film-review-real-fff.log`，临时日志不作为长期发布材料。

测试显式假设 linear-rec2020，仅用于验证原始样本读取、数值转换和写出链路；不证明实际 FFF 原始空间、传递函数、色彩准确度或 FlexColor 处理重现。本测试也不等同于工作台经调度/内存准入的完整大图预览和批量导出验收。

## 初轮验证与剩余事项（补充实施前）

以下保留初轮记录，后续完成项及最终状态以本页末尾补充验收为准。

执行 Java 全量测试、前端 typecheck/test/build、Electron typecheck/test 和脚本测试；测试结果以实际输出及 CI 为准，不在这里维护测试数量。

仍须验收：

- FFF 原始输入域与转正模型、候选 TIFF 独立配准、色卡/灰阶参考；不能只提供 linear-sRGB/Rec.2020 选项就宣称设备校准已完成。
- 经安装包、调度、内存准入的真实长条扫描全流程和峰值内存；256 行读取不等于整条处理管线都是分块计算。
- 各品牌 RAW 的代表机型、压缩方式及三/四通道处理；扩展名可导入不等于颜色正确。
- 个人观感配方的独立持久化、首批厂家曲线数字化、专属模型留出验证仍需按方案逐项交付。
- Windows x64 与 macOS x64 实机运行、断网、ICC/FFF 验证；本轮不把既有跨平台产物当作运行验证。
- 修复后重新打包、计算新哈希并完成安装包冒烟；原报告哈希不覆盖本轮改动。

内置研究目录含胶片和纸基材料，不能将目录总记录数全部称为独立胶片或已验证配置；文献 SHA 相同、源数据采集完成与模型通过校准是不同证据。

## 继续实施：个人观感、曲线与平台组件

- 个人观感作为独立版本数据持久化到固定 userData 文件，保存实际正片调整数值；应用时深复制，不污染其他照片或设备校准。安装包两次独立主进程的写入/退出/读取已通过，本机证据 `.local/film-color-implementation-20261112/presets-restart.json`。
- 底片资料页新增内置离线检索，区分胶片与纸基材料，并显示首批特性曲线。曲线不进入像素配方。
- 首批 Gold 200 / Portra 160 / Portra 400 提取厂家 PDF 矢量路径；C200 为栅格读数并复核通道位置。保留原始 logH/Status M 域、工艺、曝光条件、页码、源 SHA 和读数误差；见 [点集](film-characteristic-curves.json) 及 `scripts/extract-film-characteristic-curves.py`。所有点集 `modelReady=false`，仍需独立数值复核和受控场景验证。
- LibRaw helper 已构建 macOS arm64/x64 和 Windows x64；Windows 使用宽字符文件 API 与静态 zlib，原生适配器修正 cam_xyz 的维度索引。三目标组件均校验二进制 SHA，运行时只使用随包路径。Windows PE 的依赖仅检查了系统 DLL，不替代 Windows 运行。
- macOS x64 整包已重新构建；本机 Rosetta 下 helper/JRE 可单独执行，但整包启动健康探测未通过。Intel 实机仍未验收。
- 实际工作台测试修正大图预览沿用普通 8 秒超时的问题，超时与引擎失联分别报告；修正导出预检按 v1 inputMode 判断 v2 输入来源的问题。

### FFF 配对留出实验

`validate-fff-pairs.py` 只读原图，使用私有历史裁切和通道秩相关筛选几何候选；同一 FFF 的所有裁切只进入同一个训练或留出集合。源 SHA、帧对、分组与拒绝原因写入私有证据，不提交照片。

- Portra 160：有效候选 11 帧，留出编码 RGB 平均绝对误差约 0.0803，95% 分位约 0.3252。
- Gold 200：有效候选 11 帧，留出平均绝对误差约 0.0870，95% 分位约 0.1828。
- 预设门槛分别为 0.03 和 0.08；两组均失败。补充样片缺独立来源，不能分组验收。数据见本机 `.local/film-color-implementation-20261112/fff-pair-validation.json`。

上述实验只比较既有扫描观感，不是场景真值。失败结果不注册为胶卷专属模型，也不以提高曲线复杂度掩盖来源条件差异。用户确认没有 FlexColor/输入 ICC/受控导出或 Windows 主机；FFF 物理输入域、真实色卡/光源校准与 Windows 运行仍缺必要外部条件。

### 随包 Java 11 兼容性修复

大图包内测试实际发现 `FilmOutputProfile` 在 Java 11 逐个修改 ICC 矩阵标签时抛出 `ExceptionInInitializerError`，开发机较新 JDK 未复现。现改为完整构造带对齐标签表的 ICC 字节，再统一加载；已使用随包 Java 11 独立检查 gamma=1、D50 矩阵以及 16-bit 数值。严重 Error 会明确终结整个批次并记录日志，共享调度等待者也收到异常终态，避免界面永远显示处理中。

真实 FFF 还暴露 ExifTool 私有标签提示混入 JSON 的问题：现在标准输出与错误输出分别并发、有界读取，非零退出仍失败；已增加真实子进程成功/失败测试。阶段预览、直方图、中性取样及校准分析统一使用大图等待时限，超时和主动取消不再误报引擎失联。

独立 TIFF 标签检查另发现位深写回将 RGB 三通道的 BitsPerSample 变成单值。现复制元数据时排除源 IFD0:BitsPerSample，并保留编码器生成的通道数组；原生导出测试直接解析标签表，要求 RGB 输出保留三个值。

## 最终补充验收

- macOS arm64 修复后安装包：真实 4795×16857 FFF 经工作台预览、彩负分析、预设保存/页面重载、导出预检和任务调度，连续完成两张原尺寸 16-bit 线性 Rec.2020 TIFF。每张 484993622 字节；独立 PIL/LCMS 读取尺寸、RGB 三通道位深与 ICC 成功，两次输出的像素条带 SHA 一致。
- 原 FFF 内容 SHA 与实验前记录及导入探测一致，未改写。完整进程树按 250ms 间隔采样，观测峰值 7184990208 字节（约 6.69 GiB）；这是本机运行观察，不是所有设备的内存上限。
- 真实导出仍显式假设 FFF 输入为线性 Rec.2020，只验收读取、运算和输出链路，不证明扫描源的实际色域、gamma、反相模型或颜色准确度。
- Renderer HTTP(S) 请求被阻断时，上述本地处理与资料可用；未执行操作系统断网。个人观感另通过两次独立主进程重启读取验证。
- Java 使用随包 Java 11 完整回归；前端 typecheck/test/build、Electron typecheck/test 与脚本校验通过。测试清单以源码/CI 为准，不在文档维护测试数量。
- Mac arm64、Windows x64、Mac x64 均重新构建并校验组件；Windows 与 Intel Mac 实机未运行，Rosetta 整包启动失败。候选产物不构成平台运行验收。

本机证据：`.local/film-color-implementation-20261112/completion.json`（独立文件事实、像素 SHA、源 SHA、包 SHA），`packaged-fff/evidence.json`（任务与内存）、`java11-test.log`、`presets-restart.json`、`fff-pair-validation.json`。源照片与厂家 PDF 不提交、不随包分发。

仍未完成的物理校准：FFF 输入域、受控片基/光源/色卡及专属胶卷模型；Gold/Portra 经验映射留出未通过，Portra 400/C200 缺原始配对验证，曲线点集仍为研究状态。没有 FlexColor/输入 ICC 或受控样片时，不能把已编码扫描观感当作物理真值。

### 本轮候选包指纹

- `Camera-Border-0.1.0-arm64.dmg`：SHA-256 `fb3389a43ec134aca9fb3257eec04eb49667de76f7e8a42553fa5c1a20ae1a5e`。
- `Camera-Border-Setup-0.1.0-x64.exe`：SHA-256 `be7e100226378fddd660fe122bdab70165df17f23d0edb259d1d4a49a0a555a3`。
- `Camera-Border-0.1.0-x64.dmg`：SHA-256 `35ccfd45cbf43d4638f825b8498000b22b110251c4dbe7052c7d9178cc04f1ab`。
