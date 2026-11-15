# 胶片厂家技术资料与校色用途

检索日期：2026-11-12。面向本机扫描图库的底片校色准备，归属 Java 引擎的研究与验收资料。
本次未改动运行时算法、API、默认色彩行为或胶卷预设。

本文件保留首轮检索记录；按用户要求扩展的现售与历史彩负、反转、黑白、电影及论坛资料，
统一查阅[完整研究目录](film-color-catalog.md)与[结构化清单](film-color-catalog.json)。

## 已核验的厂家资料

技术表中的曲线属于指定曝光、显影和测量条件下的胶片响应，不是成片的 RGB 调色曲线。
下表优先收录厂家自有域名资料，版本按 PDF 正文识别，不能把网址的上传年月当作乳剂版本。

| 产品 | 厂家原始资料 | 能用于校色的内容与限制 |
|---|---|---|
| Kodak Gold 200 | [E-7022，2022-03](https://kodakprofessional.com/sites/default/files/wysiwyg/E7022-1.pdf) | 有三通道特性、光谱感度及染料密度曲线，可作为金200响应建模的依据；不能直接得到 HS1800 输出配方 |
| Kodak Portra 160 | [E-4051，2025-01](https://www.kodakprofessional.com/sites/default/files/2025-07/e4051.pdf) | 有特性、光谱感度、染料密度、MTF 与扫描说明；厂家强调自然肤色，可结合本机人像组做视觉对照 |
| Kodak Portra 400 | [E-4050，2025-01](https://www.kodakprofessional.com/sites/default/files/2025-07/e4050.pdf) | 独立技术表，不与160共用一套未经验证的数值曲线 |
| Kodak Ektar 100 | [E-4046，2025-01](https://www.kodakprofessional.com/sites/default/files/2025-07/e4046.pdf) | 有技术曲线，厂家强调高饱和度；独立收录，不与玩家所称的「人像100」混为一款 |
| FUJICOLOR C200 | [AF3-0249E，正文尾注17.05](https://asset.fujifilm.com/www/us/files/2025-06/79a1ad75d6ce087912eb7f63bfebb1f1/films_c200_datasheet_01.pdf) | 有特性、光谱感度、染料密度、MTF 曲线；特性曲线条件为日光、CN-16、Status M。不能直接套到未确认版本的 FUJIFILM 200 |
| FUJICOLOR SUPERIA X-TRA 400 | [AF3-0217E，产品代码CH](https://asset.fujifilm.com/www/us/files/2025-06/8abba3dd9d004f44d1e9c7fdbdf5c520/films_superia-xtra400_datasheet_01.pdf) | 有三通道与光谱相关曲线；图库「c400」不能仅凭名称认定为此款 |
| FUJIFILM 400 | [厂家规格页及其技术表入口](https://www.fujifilm.com/us/en/consumer/films/consumer-film/fujifilm-400/specifications) | 当前页面列明 ISO 400、日光平衡、C-41；与上行分开登记，需包装/片边确认对应产品 |
| Kodak VISION3 200T 5213/7213 | [H-1-5213，2026-03](https://www.kodak.com/content/products-brochures/motion-picture/KODAK-VISION3-200T-5213-7213-technical-information.pdf) | 灯光型，官方工艺为 ECN-2，含响应曲线与扫描说明；不能把分装、去碳或改用其他工艺的结果视为同一测量条件 |
| Kodak VISION3 500T 5219/7219 | [H-1-5219，2026-03](https://www.kodak.com/content/products-brochures/motion-picture/KODAK-VISION3-5219-7219-technical-information.pdf) | 同样需记录实际批次与工艺；与5213分开建模 |
| ILFORD HP5 PLUS | [厂家技术表，2018-11](https://www.ilfordphoto.com/amfile/file/download/file/1903/product/695/) | 有光谱感度与特性曲线；特性曲线标明 ILFOTEC HC 1+31、20℃、6½分钟等条件。用于黑白影调，不能作为彩色通道目标 |

柯达静态摄影技术资料的上级入口是[厂家资源页](https://www.kodakprofessional.com/photographers/resources)，
ILFORD 的上级入口是[厂家技术资料页](https://www.ilfordphoto.com/technical-data/)。

## 版本与身份缺口

- **电影卷版本**：2026-03 的5213/5219技术表写明以防光晕底层替代传统 remjet，
  [另一份厂家5219资料](https://www.kodak.com/content/products-brochures/motion-picture/KODAK-VISION3-5219-7219-brochure.pdf)
  则仍写明 remjet。必须保留两种来源，不能仅按扫描日期或「5219」目录名选择版本。
- **富士产品名**：C200、FUJIFILM 200、SUPERIA X-TRA 400、FUJIFILM 400
  不按简称自动合并。厂家资料可获取不代表本机照片型号已确认，更不代表当前仍在生产。
- **ILFORD PAN400**：本轮未核验到对应的厂家原站技术表。厂家入口中的 KENTMERE PAN400
  不能代替 ILFORD PAN400；也不能用 HP5 PLUS 数据直接填补。先核对包装或片边。
- **乐凯200**：本轮尝试访问中国乐凯集团站 `luckyfilm.com` 超时，
  [乐凯影像商城](https://www.lucky.cn/)有 C200 产品检索结果，但未取得可核验的厂家
  特性/光谱曲线。状态是「本轮未找到」，不是断言厂家没有资料。
  名称带 Lucky 的海外网站不自动视为中国乐凯制造商官网；历史 Super 200 也不代替新 C200。
- **玩家称呼**：「人像100」通常用于 Pro Image 100，「炮塔」用于 Portra；已在扩展目录
  保留检索关系与社区出处，不要求用户改目录名。俗称不提供乳剂批次或显影工艺信息。

## 如何与本机扫描参考结合

以下是基于资料类型和现有管线作出的工程判断，不是厂家提供的现成配方：

1. **先确认型号与工艺**：记录包装、片边代码、批次、拍摄光源与冲洗工艺，明确技术表是否适用。
   保留 PDF 正文版本、来源网址和文件指纹。
2. **厂家资料辅助响应建模**：特性曲线描述曝光与密度关系；光谱感度描述感光层响应；
   染料密度曲线描述负片透射的光谱特性。它们可以约束转正模型，但不等于线性工作图上的曲线控件。
3. **实际设备单独校准**：翻拍光源、相机响应、片基和扫描软件处理均会影响结果。
   厂家用 Status M 等条件测得的密度不等同于任意相机的 RGB；不能直接用三条曲线反查像素，
   宣称实现了设备无关还原。
4. **用户扫描图定义观感目标**：沿用[本机扫描成片参考](film-color-reference-20261112.md)的
   ICC 处理和人像/日景/夜景/黑白分组；用同一画面的翻拍 RAW 与扫描成片配对、配准和留出验证。
   没有配对时，只做视觉约束，不生成标称「官方还原」或「HS1800精确匹配」的 LUT。
5. **接入仍用共享配方**：经过验证的调整才进入现有 `RenderRecipe.imageProcessing`，
   在预览、单图及批量导出使用同一份有效配方；默认模式与零调整保持原有行为。
   本次没有从图表读出精确点集，也没有生成可投入使用的曲线或新增预设。

因此，现阶段最有价值的组合是：**厂家技术资料约束胶片响应，本机扫描成片对照期望观感，
同画面配对样片验证具体设备与参数**。

## 本机缓存与验证

已下载的原始 PDF 及下载失败项登记在
`.local/film-color-reference-20261112/manufacturer-sources/manifest.json`，
包含来源、实际跳转网址、检索日期与已下载文件的 SHA-256；不提交第三方 PDF、不加入安装包。
HP5 PLUS 技术表已通过在线读取核验，但本机下载失败，清单保留失败原因，不能计入已缓存文件。

本次为资料检索与文档变更；验证文档链接、缓存 PDF 文件头及 SHA-256，不替代算法或色彩验收。
