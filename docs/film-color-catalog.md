# 胶片校色资料目录

检索快照：2026-11-12。范围：彩负、彩色反转、黑白、电影，兼收与分装卷相关的航空、打印及特殊材料。

本目录按用户要求先查厂家/品牌官网，再用厂家原著历史镜像补断链，最后查论坛与玩家资料。
“炮塔”“人像100”“金200”等保留为玩家检索别称，不要求修改原有照片目录。

## 阅读入口

- [结构化完整清单](film-color-catalog.json)：每个型号的来源、数据类型、工艺条件、局限与关联记录。
- [CSV目录](film-color-catalog.csv)：可导入表格按品牌、类型、资料层级筛选。
- 本机离线检索页：`.local/film-color-reference-20261112/film-color-library.html`。
- 本机PDF缓存与指纹：`.local/film-color-reference-20261112/document-cache-manifest.json`；第三方原文不提交Git或安装包。

## 本轮覆盖与完整性

本次收录 **400 条胶片产品/年代/工艺记录**，另列 4 条纸基材料，涉及 31 个品牌标签、352 个去重来源网址。
这个数字不是独立乳剂数，也不是已验证的校色方案数：地区版、历史版、专业/消费包装、工艺分支仍有关系待核验。
已尽量扩大到主要现行与历史系列；对于未收录的世界历史型号、短期贴牌、分装商批次及失传原表，不作已收齐声明。

| 资料层级 | 透明胶片记录数 | 含义 |
|---|---:|---|
| 技术图表（未数字化） | 198 | 文献包含相关技术图表，未数字化/拟合/实测验收 |
| 产品/工艺说明 | 133 | 产品说明/工艺/显影数据，不等于已获色彩曲线 |
| 身份线索/缺口 | 66 | 仅身份/历史/搜索/论坛线索或缺口 |
| 扫描建议起点 | 3 | 特定产品与软件/扫描仪的建议起点，非通用LUT |

只有显影时间表不算拿到特性曲线；曲线图也尚未被数字化、拟合或用本机配对样片验收。
厂家仍托管的技术资料可能已经停产。原站产品列表也不保证当地在售、有现货或所有规格继续生产。

## 对本项目最有用的发现

1. **有真正的扫描仪参数资料。** HARMAN Phoenix 200 原版与 Switch Azure 的官方资料包含 HS1800/LS600/LS1100 建议；不同乳剂与软件参数分别登记，不能把 Phoenix 原版设置套到 Phoenix II/125。原参数、页码和版本见下文。
2. **厂家保留了大量历史原表。** [富士日本技术资料库](https://www.fujifilm.com/jp/ja/consumer/support/films/negative-and-reversal/datasheet)含 REALA ACE、Venus、NATURA、老 PRO、TREBI、Sensia 与 NEOPAN 等；历史手册及原著镜像补充了 Kodak Royal Gold、Portra NC/VC、Ektachrome、Kodachrome，以及 Fuji ETERNA。
3. **黑白要保留药水条件。** ILFORD、Kentmere、Foma、Rollei、ADOX、Bergger 等按资料记录显影时间、药水、温度或反差条件；PAN100/PAN400 的药水表不能冒充专属响应曲线。
4. **扫描目标与胶片响应分开。** 厂家特性/光谱资料约束胶片模型；用户扫描图定义期望观感。论坛的“同乳剂”判断、过期偏色和风格评价只做线索，不自动生成共享预设。
5. **材料与工艺不能混。** LomoChrome 属彩负产品；Washi X100 有负片/反转两个工艺分支；Kodachrome、E-6、C-41、ECN-2与黑白正冲分别处理。2383等打印材料、航空片、Washi纸基材料单列。

## 玩家别称

| 玩家称呼 | 对应检索目标 | 说明 |
|---|---|---|
| 炮塔160 | Portra 160 | Portra玩家译称，来源页同时标明Portra160。 |
| 炮塔400 | Portra 400 | 按用户说明与社区用法登记。 |
| 炮塔800 | Portra 800 | 用于检索，不代表任何配方版本。 |
| 人像100 | Pro Image 100 | 通常指ProImage100；不是Ektar100。 |
| 金200 | Gold 200 | Gold200玩家简称。 |
| CP200 / 易拍200 | ColorPlus 200 | ColorPlus200检索名；本轮未找到专属厂家曲线，不能拿Gold表替代。 |
| c400 | Superia X-tra 400 / FUJIFILM 400 / SUPERIA PREMIUM 400 | 保留玩家简称；不同地区/版本并列，非错误命名，不要求用户改目录。 |

别称来自用户语境、社区与中文产品记录，用于搜索和选择；它们不是厂家正式命名或跨批次校色参数等价的证明。

## 官方扫描参数摘录

以下为厂家给特定产品/设备的**调机起点**，不是本应用已经接入的预设；保留原软件字段名。

### Phoenix 200 · HS1800 / LS600 / LS1100

来源：[HARMAN Phoenix 200 Recommended Scanning Parameters，Oct2024](https://www.harmanphoto.co.uk/wp/wp-content/uploads/sites/3/2024/10/Phoenix-Scanning-Parameters-011024.pdf)；PDF正文页码 3；版本：Oct2024 PDF；Noritsu建议标明2024-09修订。

| 原软件字段 | 建议值 |
|---|---|
| Input Type | Negative |
| Colour Correction | Std |
| Gradation Correction(135) | ON |
| Basic Dens Correction | 1 |
| Scanner | ON |
| Tungsten Correction | 80 |
| CF | 80 |
| Basic colour correction | 0 |
| Auto Contrast Ov | -3 |
| Auto Contrast Sh | 0 |
| Auto Contrast Hi | -3 |
| Auto Sharpness | 0 |
| Chroma | 90 |
| Grain Suppression | 0 |
| Auto Contrast 2 | 5 |
| CS Balance (red) | -5 |
| CS Balance (blue) | 0 |
| Y | -2 |
| M | 0 |
| C | 0 |
| D | 按图调整 |

厂家建议起点，不是校色LUT；不适用于PhoenixII、125或任意其他胶片的未经验证映射。

### Switch Azure125 · HS1800 / LS600 / LS1100

来源：[HARMAN Switch Azure技术表 B26](https://www.harmanphoto.co.uk/amfile/file/download/file/1969/product/2229/)；PDF正文页码 4, 5, 6；版本：B26。

| 原软件字段 | 建议值 |
|---|---|
| Auto Contrast 2 | disabled |
| C | 1 |
| M | 0 |
| Y | -2 |
| D | 按图调整 |
| Automatic Contrast Overall | 0 |
| Automatic Contrast Shadow | 0 |
| Automatic Contrast Highlight | 0 |
| Automatic Sharpness | 0 |
| Chroma | 100 |
| Graininess Suppression | 5 |
| More Suppression | 0 |
| Color Slope Balance Red | 0 |
| Color Slope Balance Blue | 0 |
| Lens Aberration | OFF |

已人工查看原PDF第5页DSA截图，抄录明确可读字段；Auto Contrast2禁用。厂家调机起点，不能自动用于其他产品；第4页比较指出全自动可能偏橙粉且不一致。

### Phoenix 200 · Fujifilm SP3000

来源：[HARMAN Phoenix 200 Recommended Scanning Parameters，Oct2024](https://www.harmanphoto.co.uk/wp/wp-content/uploads/sites/3/2024/10/Phoenix-Scanning-Parameters-011024.pdf)；PDF正文页码 1, 2；版本：Oct2024。

| 原软件字段 | 建议值 |
|---|---|
| Negative mode | {'Hypertone': 'Yes', 'Tone adjustment': 'Standard', 'Gamma shadow': -4, 'Gamma midtone': -2, 'Gamma highlight': 0, 'Saturation': -3, 'Sharpness Process': 'No'} |
| Reversal mode | {'Full Correction': 'on', 'Gamma shadow': 0, 'Gamma midtone': 0, 'Gamma highlight': 0, 'Saturation': 0, 'Sharpness Process': 'No', 'post': '外部软件反相后再按曝光条件平衡'} |

厂家给两种可选工作流；SP3000字段不能机械映射到HS1800；从文字逐项摘录，不猜截图。

### Switch Azure125 · Fujifilm SP3000

来源：[HARMAN Switch Azure技术表 B26](https://www.harmanphoto.co.uk/amfile/file/download/file/1969/product/2229/)；PDF正文页码 5；版本：B26。

| 原软件字段 | 建议值 |
|---|---|
| Tone adjustment | All Hard |
| C | -2 |
| M | 0 |
| Y | 2 |
| D | 按图调整 |
| other channel settings | 默认 |

与同表Noritsu的C+1/Y-2是不同设备起点；不共用数值。

## 按类型查阅

每行首要来源直接链接到已发现的文献或页面。所有补充来源、具体版本条件和失败记录以JSON为准。

### 彩色负片

| 品牌 · 型号 | 别称/地区名 | 资料层级 | 状态 | 取得的数据类型 | 首要来源 |
|---|---|---|---|---|---|
| Agfa · Agfacolor Optima 100 EYE VISION | — | 技术图表（未数字化） | 历史文献 | 密度/光谱相关曲线 / EYE VISION感色说明 / 工艺 | [厂家原著镜像](https://125px.com/docs/film/agfa/Datasheet_F_PF_E4.pdf) |
| Agfa · Agfacolor Optima 200 EYE VISION | — | 技术图表（未数字化） | 历史文献 | 密度/光谱相关曲线 / EYE VISION感色说明 / 工艺 | [厂家原著镜像](https://125px.com/docs/film/agfa/Datasheet_F_PF_E4.pdf) |
| Agfa · Agfacolor Optima 400 EYE VISION | — | 技术图表（未数字化） | 历史文献 | 密度/光谱相关曲线 / EYE VISION感色说明 / 工艺 | [厂家原著镜像](https://125px.com/docs/film/agfa/Datasheet_F_PF_E4.pdf) |
| Agfa · Agfacolor Optima II 100 | — | 技术图表（未数字化） | 历史文献 | 色密度曲线 / 光谱感度 / 光谱密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/agfa/agfa_films.pdf) |
| Agfa · Agfacolor Optima II 200 | — | 技术图表（未数字化） | 历史文献 | 色密度曲线 / 光谱感度 / 光谱密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/agfa/agfa_films.pdf) |
| Agfa · Agfacolor Optima II 400 | — | 技术图表（未数字化） | 历史文献 | 色密度曲线 / 光谱感度 / 光谱密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/agfa/agfa_films.pdf) |
| Agfa · Agfacolor Portrait XPS160 | — | 技术图表（未数字化） | 历史文献 | 色密度曲线 / 光谱感度 / 光谱密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/agfa/agfa_films.pdf) |
| Agfa · Agfacolor Portrait160 | — | 技术图表（未数字化） | 历史文献 | 色密度曲线 / 光谱感度 / 光谱密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/agfa/Datasheet_F_PF_E4.pdf) |
| Agfa · Agfacolor Ultra50 | — | 技术图表（未数字化） | 历史文献 | 色密度曲线 / 光谱感度 / 光谱密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/agfa/agfa_films.pdf) |
| Agfa · Ultra100 | — | 身份线索/缺口 | 待核验 | 厂家旧技术表索引线索 | [厂家原著镜像](https://www.yumpu.com/en/document/view/22040653/films-technical-data-gomma) |
| Agfa · Vista 100 | — | 身份线索/缺口 | 待核验 | 厂家旧技术表索引线索 | [厂家原著镜像](https://www.yumpu.com/en/document/view/22040653/films-technical-data-gomma) |
| Agfa · Vista 200 | — | 身份线索/缺口 | 待核验 | 厂家旧技术表索引线索 | [厂家原著镜像](https://www.yumpu.com/en/document/view/22040653/films-technical-data-gomma) |
| Agfa · Vista 400 | — | 身份线索/缺口 | 待核验 | 厂家旧技术表索引线索 | [厂家原著镜像](https://www.yumpu.com/en/document/view/22040653/films-technical-data-gomma) |
| Agfa · Vista 800 | — | 身份线索/缺口 | 待核验 | 厂家旧技术表索引线索 | [厂家原著镜像](https://www.yumpu.com/en/document/view/22040653/films-technical-data-gomma) |
| CatLABS · X FILM100 | — | 产品/工艺说明 | 原站列出 | 品牌目录存在 / 彩负类型与格式 | [厂家原站](https://www.catlabs.info/category/film) |
| CatLABS · X FILM800TRADEMARK | — | 产品/工艺说明 | 原站列出 | 品牌目录存在 / 彩负类型与格式 | [厂家原站](https://www.catlabs.info/category/film) |
| CineStill · 400Dynamic | 400D | 产品/工艺说明 | 原站列出 | 色温平衡/工艺 / 品牌观感 / 来源和产品版本说明 | [品牌原站](https://cinestillfilm.com/collections) |
| CineStill · 50Daylight | 50D | 产品/工艺说明 | 原站列出 | 色温平衡/工艺 / 品牌观感 / 来源和产品版本说明 | [品牌原站](https://cinestillfilm.com/collections) |
| CineStill · 800Tungsten | 800T | 产品/工艺说明 | 原站列出 | 色温平衡/工艺 / 品牌观感 / 来源和产品版本说明 | [品牌原站](https://cinestillfilm.com/collections) |
| Ferrania · Solaris 100 | — | 身份线索/缺口 | 待核验 | 历史论坛型号回忆 | [社区](https://www.photrio.com/forum/threads/hello-apug-from-film-ferrania-part-2.128272/page-32) |
| Ferrania · Solaris 200 | — | 身份线索/缺口 | 待核验 | 历史论坛型号回忆 | [社区](https://www.photrio.com/forum/threads/hello-apug-from-film-ferrania-part-2.128272/page-32) |
| Ferrania · Solaris 400 | — | 身份线索/缺口 | 待核验 | 历史论坛型号回忆 | [社区](https://www.photrio.com/forum/threads/hello-apug-from-film-ferrania-part-2.128272/page-32) |
| Ferrania · Solaris 800 | — | 身份线索/缺口 | 待核验 | 历史论坛型号回忆 | [社区](https://www.photrio.com/forum/threads/hello-apug-from-film-ferrania-part-2.128272/page-32) |
| Film Washi · X100 Maskless Color Film | Washi X | 产品/工艺说明 | 原站列出 | 无橙罩说明 / 品牌暖调/高饱和描述 / C41负片/E6反转双工艺 | [厂家原站](https://filmwashi.com/en/products/135_films/) |
| FilmNeverDie · IRO 200 | — | 产品/工艺说明 | 历史文献 | ISO200 / C-41 / 2017品牌样图/说明 | [品牌原站](https://filmneverdie.com/blogs/news/filmneverdie-iro-200-pre-orders-faq) |
| FilmNeverDie · IRO 400 | — | 产品/工艺说明 | 原站列出 | ISO400 / C-41 / 35mm/36exp | [品牌原站](https://filmneverdie.com/products/filmneverdie-iro-400-35mm-36-exp) |
| FilmNeverDie · KIRO 400 | — | 产品/工艺说明 | 原站列出 | 品牌C41彩负身份与感光度 / 品牌观感描述 | [品牌原站](https://filmneverdie.com/pages/bulk-fnd-films-buy) |
| FilmNeverDie · SORA 200 | — | 产品/工艺说明 | 原站列出 | 品牌C41彩负身份与感光度 / 品牌观感描述 | [品牌原站](https://filmneverdie.com/pages/bulk-fnd-films-buy) |
| FilmNeverDie · UMI 800 | — | 产品/工艺说明 | 原站列出 | 品牌C41彩负身份与感光度 / 品牌观感描述 | [品牌原站](https://filmneverdie.com/pages/bulk-fnd-films-buy) |
| FilmNeverDie · ZOMBIE 400 | — | 产品/工艺说明 | 原站列出 | 品牌C41彩负身份与感光度 / 品牌观感描述 | [品牌原站](https://filmneverdie.com/pages/bulk-fnd-films-buy) |
| Flic Film · Elektra 100 | — | 身份线索/缺口 | 待核验 | 论坛产品/实验工艺线索 | 原站不可用，见缺口 |
| Fujifilm · 160NC (historical) | 160NC | 产品/工艺说明 | 历史文献 | 无专属曲线 | [厂家原站](https://asset.fujifilm.com/www/jp/files/2024-04/5ecc52450b40a774406d7f1546b29567/datasheet_160nc_01.pdf) |
| Fujifilm · 160NL | — | 产品/工艺说明 | 历史文献 | 无专属曲线 | [厂家原站](https://asset.fujifilm.com/www/jp/files/2024-04/1e776698fb5204129be58bc97ad95239/datasheet_160nl_01.pdf) |
| Fujifilm · 160NPC | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / MTF | [厂家原站](https://asset.fujifilm.com/www/jp/files/2024-04/6cc43e223cf542ef0ecc6eed551459ee/datasheet_160npc_01.pdf) |
| Fujifilm · 160NS (historical) | 160NS | 产品/工艺说明 | 历史文献 | 无专属曲线 | [厂家原站](https://asset.fujifilm.com/www/jp/files/2024-04/cf720a8045c8ed1cb9f107a784ba2cc4/datasheet_160ns_01.pdf) |
| Fujifilm · C200 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 | [厂家原站](https://asset.fujifilm.com/www/us/files/2025-06/79a1ad75d6ce087912eb7f63bfebb1f1/films_c200_datasheet_01.pdf) |
| Fujifilm · FUJICOLOR 100 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / MTF | [厂家原站](https://asset.fujifilm.com/www/jp/files/2019-12/05b4b671ff6c0e53b8f7df233d57dfd7/datasheet_fujicolor100_01.pdf) |
| Fujifilm · FUJIFILM 200 | — | 产品/工艺说明 | 待核验 | 无专属曲线 | [厂家原站](https://www.fujifilm.com/us/en/consumer/films/consumer-film/fujifilm-200) |
| Fujifilm · FUJIFILM 400 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 | [厂家原站](https://asset.fujifilm.com/www/jp/files/2024-04/a97a9256fa03c083a1c735495be1bd60/datasheet_fujifilm400_01.pdf) |
| Fujifilm · NATURA 1600 | フジカラー NATURA 1600 | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / MTF | [厂家原站](https://asset.fujifilm.com/www/jp/files/2024-04/96b634a89ec6a5abda6b70437f4d75a4/datasheet_natura1600_01.pdf) |
| Fujifilm · New PRO 400 | New PRO400 | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / MTF | [厂家原站](https://asset.fujifilm.com/www/jp/files/2024-04/9aa1f2e4488cd7d13abefed690cf289c/datasheet_newpro400_01.pdf) |
| Fujifilm · nexia 400 | フジカラー nexia 400 | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / MTF | [厂家原站](https://asset.fujifilm.com/www/jp/files/2019-12/b71c82d2ee200a440344c92e78630473/datasheet_nexia400_01.pdf) |
| Fujifilm · nexia Zoom Master 800 | フジカラー nexia ズームマスター 800 | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / MTF | [厂家原站](https://asset.fujifilm.com/www/jp/files/2019-12/e83cba09d325b173158e890279d7b919/datasheet_nexiazoommaster800_01.pdf) |
| Fujifilm · NPL 160 | — | 产品/工艺说明 | 历史文献 | 历史型号与光源/显影说明 | [厂家原站](https://asset.fujifilm.com/www/ca/files/2020-03/d52487c5c6f84e7f935c299491c5c1ff/ProfessionalFilmDataGuide.pdf) |
| Fujifilm · NPZ 800 | — | 产品/工艺说明 | 历史文献 | 无专属曲线 | [厂家原著镜像](https://125px.com/docs/film/fuji/NPZ.pdf) |
| Fujifilm · PRESS 400 | — | 产品/工艺说明 | 历史文献 | 历史型号与光源/显影说明 | [厂家原站](https://asset.fujifilm.com/www/ca/files/2020-03/d52487c5c6f84e7f935c299491c5c1ff/ProfessionalFilmDataGuide.pdf) |
| Fujifilm · PRESS 800 | — | 产品/工艺说明 | 历史文献 | 历史型号与光源/显影说明 | [厂家原站](https://asset.fujifilm.com/www/ca/files/2020-03/d52487c5c6f84e7f935c299491c5c1ff/ProfessionalFilmDataGuide.pdf) |
| Fujifilm · PRO 160C | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/fuji/pro_160c_datasheet.pdf) |
| Fujifilm · PRO 160NC | PRO160NC | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / MTF | [厂家原站](https://asset.fujifilm.com/www/jp/files/2024-04/580aa23b1083768640aa3885942918dc/datasheet_pro160nc_01.pdf) |
| Fujifilm · PRO 160NH | PRO160NH | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / MTF | [厂家原站](https://asset.fujifilm.com/www/jp/files/2024-04/bae096c3cfae4c41066de30038ea6ddf/datasheet_pro160nh_01.pdf) |
| Fujifilm · PRO 160NS | PRO160NS | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / MTF | [厂家原站](https://asset.fujifilm.com/www/jp/files/2024-04/6b75b1c1cb4253623fb2cd7a56ff7443/datasheet_pro160ns_01.pdf) |
| Fujifilm · PRO 160S | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/fuji/pro_160s_datasheet.pdf) |
| Fujifilm · PRO 400H | PRO400H | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF | [厂家原站](https://asset.fujifilm.com/www/jp/files/2024-04/198fe31ee57628013d29171770b28218/datasheet_pro400h_01.pdf) |
| Fujifilm · PRO 800 | PRO800 | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / MTF | [厂家原站](https://asset.fujifilm.com/www/jp/files/2019-12/9b41c4aaa31d1d293a858b0b0ffdd8e6/datasheet_pro800_01.pdf) |
| Fujifilm · PRO 800Z | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/fuji/pro_800z_datasheet.pdf) |
| Fujifilm · REALA ACE | フジカラー REALA ACE | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / MTF | [厂家原站](https://asset.fujifilm.com/www/jp/files/2024-04/2dca996da7fa6b3e34edda4c943870c2/datasheet_realaace_01.pdf) |
| Fujifilm · Superia 100 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/fuji/superia_100_datasheet.pdf) |
| Fujifilm · Superia 1600 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/fuji/superia_1600_datasheet.pdf) |
| Fujifilm · Superia 200 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/fuji/superia_200_datasheet.pdf) |
| Fujifilm · SUPERIA PREMIUM 400 | フジカラー SUPERIA PREMIUM 400 | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / MTF | [厂家原站](https://asset.fujifilm.com/www/jp/files/2019-12/3723e0912cf7e939bb07fd982b0ff9fa/datasheet_superiapremium400_01.pdf) |
| Fujifilm · Superia Reala | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/fuji/superia_reala_datasheet.pdf) |
| Fujifilm · SUPERIA Venus 400 | フジカラー SUPERIA Venus 400 | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / MTF | [厂家原站](https://asset.fujifilm.com/www/jp/files/2024-04/ec34b04900f0718db637a1bb5a9f019b/datasheet_superiavenus400_01.pdf) |
| Fujifilm · SUPERIA Venus 800 | フジカラー SUPERIA Venus 800 | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / MTF | [厂家原站](https://asset.fujifilm.com/www/jp/files/2024-04/e19e7b4cc0678c711c9be30803f3f252/datasheet_superiavenus800_01.pdf) |
| Fujifilm · Superia X-tra 400 | フジカラー SUPERIA X-TRA 400 | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF | [厂家原站](https://asset.fujifilm.com/www/us/files/2025-06/8abba3dd9d004f44d1e9c7fdbdf5c520/films_superia-xtra400_datasheet_01.pdf) |
| Fujifilm · Superia X-tra 800 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/fuji/superia_xtra800_datasheet.pdf) |
| Fujifilm · True Definition 400 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/fuji/True_Definition_DataSheet.pdf) |
| HARMAN · Phoenix 125 | — | 产品/工艺说明 | 原站列出 | DX125 / 品牌观感 / TDS下载入口 | [厂家原站](https://www.harmanphoto.co.uk/harman-phoenix-125-35mm) |
| HARMAN · Phoenix 200 | — | 技术图表（未数字化） | 历史文献 | 光谱楔形图 / 曝光/工艺条件 / HS1800扫描参数 / SP3000扫描参数 | [厂家原站](https://www.harmanphoto.co.uk/amfile/file/download/file/1963/product/2143/) |
| HARMAN · Phoenix II ISO200 | — | 技术图表（未数字化） | 原站列出 | 光谱楔形图 / 曝光/工艺条件 / 扫描建议 | [厂家原站](https://www.harmanphoto.co.uk/amfile/file/download/file/1968/product/2208/) |
| Kodak · ColorPlus 200 | CP200 / 易拍200 | 身份线索/缺口 | 待核验 | 无专属曲线 | [厂家原站](https://www.kodakprofessional.com/photographers/resources) |
| Kodak · EKTACOLOR PRO 160 | — | 产品/工艺说明 | 原站列出 | 无专属曲线 | [厂家原站](https://www.kodak.com/en/still-film/product/professional/ektacolor/ektacolor-pro-160-film/) |
| Kodak · EKTACOLOR PRO 400 | — | 产品/工艺说明 | 原站列出 | 无专属曲线 | [厂家原站](https://www.kodak.com/en/still-film/products/professional/) |
| Kodak · EKTACOLOR PRO 800 | — | 产品/工艺说明 | 原站列出 | 无专属曲线 | [厂家原站](https://www.kodak.com/en/still-film/product/professional/ektacolor/ektacolor-pro-800-film/) |
| Kodak · EKTAPRESS PJ100 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / 显影条件 | [厂家原著镜像](https://125px.com/docs/film/kodak/e116-Ektapress.pdf) |
| Kodak · EKTAPRESS PJ400 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / 显影条件 | [厂家原著镜像](https://125px.com/docs/film/kodak/e116-Ektapress.pdf) |
| Kodak · EKTAPRESS PJ800 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / 显影条件 | [厂家原著镜像](https://125px.com/docs/film/kodak/e116-Ektapress.pdf) |
| Kodak · Ektar 100 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF | [厂家原站](https://www.kodakprofessional.com/sites/default/files/2025-07/e4046.pdf) |
| Kodak · Elite Color 200 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/kodak/e4039-Elite.pdf) |
| Kodak · Elite Color 400 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/kodak/e4039-Elite.pdf) |
| Kodak · Gold 100 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 | [厂家原著镜像](https://125px.com/docs/film/kodak/E7022-Gold_100_200.pdf) |
| Kodak · Gold 100 Bright Sun GA | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 | [厂家原著镜像](https://125px.com/docs/film/kodak/e2328-GA100.pdf) |
| Kodak · Gold 200 | 金200 | 技术图表（未数字化） | 历史文献 | 光谱感度 / 染料密度 / 特性曲线 | [厂家原站](https://kodakprofessional.com/sites/default/files/wysiwyg/E7022-1.pdf) |
| Kodak · High Definition 200 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 | [厂家原著镜像](https://125px.com/docs/film/kodak/e7017-HD200.pdf) |
| Kodak · High Definition 400 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 染料密度 | [厂家原著镜像](https://125px.com/docs/film/kodak/e7013-HD400.pdf) |
| Kodak · KODACOLOR 100 | — | 产品/工艺说明 | 原站列出 | 无专属曲线 | [厂家原站](https://www.kodak.com/en/still-film/product/consumer/kodacolor-film/) |
| Kodak · KODACOLOR 200 | — | 产品/工艺说明 | 原站列出 | 无专属曲线 | [厂家原站](https://www.kodak.com/en/still-film/product/consumer/kodacolor-film/) |
| Kodak · Law Enforcement LE100 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / 显影条件 | [厂家原著镜像](https://125px.com/docs/film/kodak/le1-2003_04.pdf) |
| Kodak · Law Enforcement LE400 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / 显影条件 | [厂家原著镜像](https://125px.com/docs/film/kodak/le1-2003_04.pdf) |
| Kodak · Law Enforcement LE800 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / 显影条件 | [厂家原著镜像](https://125px.com/docs/film/kodak/le1-2003_04.pdf) |
| Kodak · Portra 100T | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / 相反律 | [厂家原著镜像](https://125px.com/docs/film/kodak/e2468-Portra_100T.pdf) |
| Kodak · Portra 160 | 炮塔160 / PORTRA 160 | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF | [厂家原站](https://www.kodakprofessional.com/sites/default/files/2025-07/e4051.pdf) |
| Kodak · Portra 160NC | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/kodak/e4040-Portra-2009.pdf) |
| Kodak · Portra 160VC | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/kodak/e4040-Portra-2009.pdf) |
| Kodak · Portra 400 | 炮塔400 | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF | [厂家原站](https://www.kodakprofessional.com/sites/default/files/2025-07/e4050.pdf) |
| Kodak · Portra 400NC | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/kodak/e4040-Portra-2009.pdf) |
| Kodak · Portra 400VC | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/kodak/e4040-Portra-2009.pdf) |
| Kodak · Portra 800 | 炮塔800 | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF | [厂家原站](https://www.kodakprofessional.com/sites/default/files/2025-07/e4040.pdf) |
| Kodak · Pro 1000 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / 相反律 | [厂家原著镜像](https://125px.com/docs/film/kodak/e182-Pro_Films.pdf) |
| Kodak · Pro 100T | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / 相反律 | [厂家原著镜像](https://125px.com/docs/film/kodak/e29-Pro_100T_PRT.pdf) |
| Kodak · Pro 400 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / 相反律 | [厂家原著镜像](https://125px.com/docs/film/kodak/e182-Pro_Films.pdf) |
| Kodak · Pro 400 MC | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / 相反律 | [厂家原著镜像](https://125px.com/docs/film/kodak/e182-Pro_Films.pdf) |
| Kodak · Pro Image 100 | ProImage100 / 人像100 | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 | [厂家原著镜像](https://dreamartemis.wordpress.com/wp-content/uploads/2014/01/kodak-proimage-100.pdf) |
| Kodak · Profoto 100 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 | [厂家原著镜像](https://125px.com/docs/film/kodak/e2e-Profoto_100.pdf) |
| Kodak · Recording Film 2475 | — | 产品/工艺说明 | 历史文献 | 无专属曲线 | [厂家原著镜像](https://125px.com/docs/film/kodak/2475.pdf) |
| Kodak · Royal Gold 100 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 | [厂家原著镜像](https://125px.com/docs/film/kodak/e41-1998_02.pdf) |
| Kodak · Royal Gold 1000 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 | [厂家原著镜像](https://125px.com/docs/film/kodak/e44-1998_02.pdf) |
| Kodak · Royal Gold 200 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 | [厂家原著镜像](https://125px.com/docs/film/kodak/e42-1998_02.pdf) |
| Kodak · Royal Gold 25 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 | [厂家原著镜像](https://125px.com/docs/film/kodak/e40-1996_12.pdf) |
| Kodak · Royal Gold 400 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 | [厂家原著镜像](https://125px.com/docs/film/kodak/e2509-2000_01.pdf) |
| Kodak · ROYAL SUPRA 200 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / 显影条件 | [厂家原著镜像](https://125px.com/docs/film/kodak/e4026-2002_06.pdf) |
| Kodak · ROYAL SUPRA 400 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / 显影条件 | [厂家原著镜像](https://125px.com/docs/film/kodak/e4026-2002_06.pdf) |
| Kodak · ROYAL SUPRA 800 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / 显影条件 | [厂家原著镜像](https://125px.com/docs/film/kodak/e4026-2002_06.pdf) |
| Kodak · SUPRA 100 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / 显影条件 | [厂家原著镜像](https://125px.com/docs/film/kodak/e2519-2003_05.pdf) |
| Kodak · SUPRA 200 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / 显影条件 | [厂家原著镜像](https://125px.com/docs/film/kodak/e4029-2003_05.pdf) |
| Kodak · SUPRA 400 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / 显影条件 | [厂家原著镜像](https://125px.com/docs/film/kodak/e2519-2003_05.pdf) |
| Kodak · SUPRA 800 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / 显影条件 | [厂家原著镜像](https://125px.com/docs/film/kodak/e2519-2003_05.pdf) |
| Kodak · Ultra Color 100 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/kodak/e4035-100UC_400UC.pdf) |
| Kodak · Ultra Color 400 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/kodak/e4035-100UC_400UC.pdf) |
| Kodak · Ultra Max 400 | 全能400 / 万用400 | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 | [厂家原站](https://www.kodakprofessional.com/sites/default/files/wysiwyg/pro/resources/E7023_max_400.pdf) |
| Kodak · Ultra Max 800 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 | [厂家原著镜像](https://125px.com/docs/film/kodak/E7024-Ultra_Max_800.pdf) |
| Kodak · Vericolor III | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/kodak/e26-Vericolor_III.pdf) |
| Konica · Impresa100 Portrait | — | 身份线索/缺口 | 待核验 | 原厂历史价格表检索线索 | [厂家原著镜像](https://www.konicaminoltasupport.com/fileadmin/camera_minolta/pricelist/German/g_pricelist_complete_dh.pdf) |
| Konica · New Centuria 400 | — | 产品/工艺说明 | 历史文献 | 原厂乳剂研发报告 / 感度/颗粒/异光源设计 | [厂家原著镜像](https://research.konicaminolta.com/jp/pdf/technology_report/2001/pdf/02.pdf) |
| Konica · New Centuria 800 | — | 产品/工艺说明 | 历史文献 | 原厂乳剂研发报告 / 感度/颗粒/异光源设计 | [厂家原著镜像](https://research.konicaminolta.com/jp/pdf/technology_report/2001/pdf/02.pdf) |
| Konica · VX100 Super | — | 身份线索/缺口 | 待核验 | 原厂历史价格表检索线索 | [厂家原著镜像](https://www.konicaminoltasupport.com/fileadmin/camera_minolta/pricelist/German/g_pricelist_complete_dh.pdf) |
| Lomography · Color Negative 100 | — | 产品/工艺说明 | 历史文献 | 品牌指南型号与观感描述 / 格式/曝光说明 | [品牌原站](https://www.lomography.com/magazine/327296-a-guide-to-lomography-films-and-formats) |
| Lomography · Color Negative 400 | — | 产品/工艺说明 | 历史文献 | 品牌对照样图 / C41工艺 / 曝光说明 | [品牌原站](https://www.lomography.com/magazine/327296-a-guide-to-lomography-films-and-formats) |
| Lomography · Color Negative 800 | — | 产品/工艺说明 | 历史文献 | 品牌指南型号与观感描述 / 格式/曝光说明 | [品牌原站](https://www.lomography.com/magazine/327296-a-guide-to-lomography-films-and-formats) |
| Lomography · Color Tiger200 110 | — | 产品/工艺说明 | 历史文献 | 品牌色彩描述 / 工艺说明 | [品牌原站](https://www.lomography.com/magazine/327296-a-guide-to-lomography-films-and-formats) |
| Lomography · LomoChrome Classicolor ISO200 | — | 产品/工艺说明 | 原站列出 | 品牌色彩描述 / 工艺说明 | [品牌原站](https://www.lomography.com/school/what-are-lomochrome-films-fa-g3ebpber) |
| Lomography · LomoChrome Color92 ISO400 | — | 产品/工艺说明 | 原站列出 | 品牌色彩描述 / 工艺说明 | [品牌原站](https://www.lomography.com/school/what-are-lomochrome-films-fa-g3ebpber) |
| Lomography · LomoChrome Color92 Sun-kissed ISO400 | — | 产品/工艺说明 | 原站列出 | 品牌色彩描述 / 工艺说明 | [品牌原站](https://www.lomography.com/school/what-are-lomochrome-films-fa-g3ebpber) |
| Lomography · LomoChrome Metropolis ISO100–400 | — | 产品/工艺说明 | 原站列出 | 品牌色彩描述 / 工艺说明 | [品牌原站](https://www.lomography.com/school/what-are-lomochrome-films-fa-g3ebpber) |
| Lucky · C200 / Color200 | — | 身份线索/缺口 | 待核验 | 品牌商城检索 / 明确扫描流程的玩家经验 | [品牌原站](https://www.lucky.cn/) |
| ORWO · WOLFEN NC200 | — | 产品/工艺说明 | 原站列出 | 品牌背景 / C41/ECN2两工艺 | [厂家原站](https://orwo.family/) |
| ORWO · WOLFEN NC400 | — | 产品/工艺说明 | 历史文献 | 品牌色彩描述 / 工艺说明 | [厂家原站](https://orwo.family/) |
| ORWO · WOLFEN NC500 | — | 产品/工艺说明 | 历史文献 | 品牌色彩描述 / 工艺说明 | [厂家原站](https://orwo.family/) |
| Reflx Lab · 320D AHU | — | 产品/工艺说明 | 原站列出 | 日光平衡 / ECN-2 ISO250 / C-41 ISO320 / AHU/无remjet说明 | [品牌原站](https://reflxlab.com/en-de/collections/135-film) |
| Reflx Lab · 50D AHU | — | 产品/工艺说明 | 原站列出 | 品牌目录型号/AHU | [品牌原站](https://reflxlab.com/en-de/collections/135-film) |
| Reflx Lab · 640T AHU | — | 产品/工艺说明 | 原站列出 | 灯光平衡 / ECN-2 ISO500 / C-41 ISO640 / AHU/无remjet说明 | [品牌原站](https://reflxlab.com/en-de/collections/135-film) |
| RERA/Kawauso · RERACOOL 100 | — | 产品/工艺说明 | 厂家明确停产 | 品牌正式型号/格式 / 品牌供应状态说明 | [品牌原站](https://kawauso.biz/products/list?category_id=114) |
| RERA/Kawauso · RG200 | — | 产品/工艺说明 | 原站列出 | 品牌正式型号/格式 / 品牌供应状态说明 / 品牌确认由Kodak GOLD200裁切重卷 | [品牌原站](https://kawauso.biz/products/list?category_id=114) |

### 彩色反转

| 品牌 · 型号 | 别称/地区名 | 资料层级 | 状态 | 取得的数据类型 | 首要来源 |
|---|---|---|---|---|---|
| Agfa · Agfachrome RSX II 100 | — | 技术图表（未数字化） | 历史文献 | 色密度曲线 / 光谱感度 / 光谱密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/agfa/agfa_films.pdf) |
| Agfa · Agfachrome RSX II 200 | — | 技术图表（未数字化） | 历史文献 | 色密度曲线 / 光谱感度 / 光谱密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/agfa/agfa_films.pdf) |
| Agfa · Agfachrome RSX II 50 | — | 技术图表（未数字化） | 历史文献 | 色密度曲线 / 光谱感度 / 光谱密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/agfa/agfa_films.pdf) |
| Agfa · CT Precisa 100 | — | 身份线索/缺口 | 待核验 | 厂家旧技术表索引线索 | [厂家原著镜像](https://www.yumpu.com/en/document/view/22040653/films-technical-data-gomma) |
| Agfa · CT Precisa 200 | — | 身份线索/缺口 | 待核验 | 厂家旧技术表索引线索 | [厂家原著镜像](https://www.yumpu.com/en/document/view/22040653/films-technical-data-gomma) |
| Fujifilm · 100ix | — | 产品/工艺说明 | 历史文献 | 无专属曲线 | [厂家原站](https://asset.fujifilm.com/www/jp/files/2024-04/2e58b551f440f4476e26fd8e4b4894be/datasheet_100ix_01.pdf) |
| Fujifilm · 64T Type II | 64T タイプII | 产品/工艺说明 | 历史文献 | 无专属曲线 | [厂家原站](https://asset.fujifilm.com/www/jp/files/2024-04/8ee965d020b20e9088cb012a67c77d0c/datasheet_64ttypeii_01.pdf) |
| Fujifilm · Astia 100F | アスティア100F | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原站](https://asset.fujifilm.com/www/jp/files/2024-04/5aabd425a442d98c30e91ca1bd12f4b8/datasheet_astia100f_01.pdf) |
| Fujifilm · Provia 100F | プロビア100F | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原站](https://asset.fujifilm.com/www/jp/files/2025-09/4fc51a5c0951d8692af25e0792e464de/datasheet_provia100f_01.pdf) |
| Fujifilm · Provia 400F | プロビア400F | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原站](https://asset.fujifilm.com/www/jp/files/2024-04/13bf604980eadaeec94e72018d04a8d8/datasheet_provia400f_01.pdf) |
| Fujifilm · Provia 400X | プロビア400X | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原站](https://asset.fujifilm.com/www/jp/files/2024-04/cd34674ec5beb8ba062cd221a656bbd5/datasheet_provia400x_01.pdf) |
| Fujifilm · Sensia 100 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原著镜像](https://125px.com/docs/film/fuji/sensia_100_datasheet.pdf) |
| Fujifilm · Sensia 200 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原著镜像](https://125px.com/docs/film/fuji/sensia_200_datasheet.pdf) |
| Fujifilm · Sensia 400 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原著镜像](https://125px.com/docs/film/fuji/sensia_400_datasheet.pdf) |
| Fujifilm · Sensia III 100 | センシアIII100 | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / MTF / 相反律 | [厂家原站](https://asset.fujifilm.com/www/jp/files/2024-04/78ba80660bc6e6af978b56efe045915a/datasheet_sensiaiii100_01.pdf) |
| Fujifilm · T64 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原站](https://asset.fujifilm.com/www/jp/files/2024-04/084449505a12147f2cce415fdfa87b96/datasheet_t64_01.pdf) |
| Fujifilm · TREBI 100C | トレビ100C | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / MTF / 相反律 | [厂家原站](https://asset.fujifilm.com/www/jp/files/2024-04/ae5aef947b043303bc18c218d7947f22/datasheet_trebi100c_01.pdf) |
| Fujifilm · TREBI 400 | トレビ400 | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / MTF / 相反律 | [厂家原站](https://asset.fujifilm.com/www/jp/files/2024-04/723037fb14c03cfc40bf55ac9719c8cd/datasheet_trebi400_01.pdf) |
| Fujifilm · Velvia 100 | ベルビア100 | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原站](https://asset.fujifilm.com/www/jp/files/2024-04/56c15e414d446997d6d609f5726df093/datasheet_velvia100_01.pdf) |
| Fujifilm · Velvia 100F | ベルビア100F | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原站](https://asset.fujifilm.com/www/jp/files/2025-09/784ef03368f1ae3ccce8a092cb029fd7/datasheet_velvia100f_01.pdf) |
| Fujifilm · Velvia 50 | ベルビア50 | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原站](https://asset.fujifilm.com/www/jp/files/2024-04/7d7888aab11c548b2acd50f0fee9e504/datasheet_velvia50_01.pdf) |
| Fujifilm · Velvia RVP (original) | ベルビア | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / MTF / 相反律 | [厂家原站](https://asset.fujifilm.com/www/jp/files/2024-04/f1d4dc94f56605cbc32151a1fa60e4f0/datasheet_velvia_01.pdf) |
| Kodak · Ektachrome 100 Plus | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/kodak/e113-Ektachrome_100_plus_EPP.pdf) |
| Kodak · Ektachrome 160T | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/kodak/e144-Ektachrome_160T_EPT.pdf) |
| Kodak · Ektachrome 320T | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原著镜像](https://125px.com/docs/film/kodak/e145-Ektachrome_320T_EPJ.pdf) |
| Kodak · Ektachrome 400X | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/kodak/e161-Ektachrome_400X_EPL.pdf) |
| Kodak · Ektachrome 64 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF | [厂家原著镜像](https://125px.com/docs/film/kodak/e8-Ektachrome_64_EPR.pdf) |
| Kodak · Ektachrome 64T | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原著镜像](https://125px.com/docs/film/kodak/e130-Ektachrome_64T_EPY.pdf) |
| Kodak · Ektachrome E100 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF | [厂家原站](https://kodakprofessional.com/sites/default/files/wysiwyg/pro/resources/e4000_ektachrome_100.pdf) |
| Kodak · Ektachrome E100G | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原著镜像](https://125px.com/docs/film/kodak/e4024-2009.pdf) |
| Kodak · Ektachrome E100GX | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原著镜像](https://125px.com/docs/film/kodak/e4024-2009.pdf) |
| Kodak · Ektachrome E100VS | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原著镜像](https://125px.com/docs/film/kodak/e163-Ektachrome_E100VS.pdf) |
| Kodak · Ektachrome E200 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原著镜像](https://125px.com/docs/film/kodak/e28-Ektachrome_E200.pdf) |
| Kodak · Ektachrome P1600 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 / 显影条件 | [厂家原著镜像](https://125px.com/docs/film/kodak/e147-Ektachrome_P1600_EPH.pdf) |
| Kodak · Elite Chrome 100 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原著镜像](https://125px.com/docs/film/kodak/E7014e-Elitechrome_100.pdf) |
| Kodak · Elite Chrome 200 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原著镜像](https://125px.com/docs/film/kodak/e148e-Elite_chrome_200.pdf) |
| Kodak · Elite Chrome 400 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原著镜像](https://125px.com/docs/film/kodak/e149-Elite_chrome_400.pdf) |
| Kodak · Elite Chrome Extra Color 100 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原著镜像](https://125px.com/docs/film/kodak/e126e-Elitechrome_100ec.pdf) |
| Kodak · Kodachrome 200 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原著镜像](https://125px.com/docs/film/kodak/e88-2002_03.pdf) |
| Kodak · Kodachrome 200 Professional | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原著镜像](https://125px.com/docs/film/kodak/e55-2009_06.pdf) |
| Kodak · Kodachrome 25 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原著镜像](https://125px.com/docs/film/kodak/e88-2002_03.pdf) |
| Kodak · Kodachrome 25 Professional | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原著镜像](https://125px.com/docs/film/kodak/e55-2009_06.pdf) |
| Kodak · Kodachrome 64 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原著镜像](https://125px.com/docs/film/kodak/e88-2002_03.pdf) |
| Kodak · Kodachrome 64 Professional | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原著镜像](https://125px.com/docs/film/kodak/e55-2009_06.pdf) |
| Konica · Centuria Chrome100 | — | 身份线索/缺口 | 待核验 | 原厂历史价格表检索线索 | [厂家原著镜像](https://www.konicaminoltasupport.com/fileadmin/camera_minolta/pricelist/German/g_pricelist_complete_dh.pdf) |
| Lomography · X-Pro Chrome100 | — | 身份线索/缺口 | 待核验 | 品牌社区归档型号线索 | [品牌原站](https://www.lomography.com/films) |
| Lomography · X-Pro Slide200 | — | 身份线索/缺口 | 待核验 | 品牌社区归档型号线索 | [品牌原站](https://www.lomography.com/films) |
| Lomography · X-Pro SunsetStrip100 | — | 身份线索/缺口 | 待核验 | 品牌社区归档型号线索 | [品牌原站](https://www.lomography.com/films) |
| RERA/Kawauso · RERACHROME 100 | — | 产品/工艺说明 | 厂家明确停产 | 品牌正式型号/格式 / 品牌供应状态说明 | [品牌原站](https://kawauso.biz/products/list?category_id=114) |

### 黑白摄影

| 品牌 · 型号 | 别称/地区名 | 资料层级 | 状态 | 取得的数据类型 | 首要来源 |
|---|---|---|---|---|---|
| ADOX · CHS 100 II | — | 产品/工艺说明 | 原站列出 | 感光类型/工艺与使用说明 | [厂家原站](https://www.adox.de/en/) |
| ADOX · CHS 100 Type I | — | 产品/工艺说明 | 厂家明确停产 | 厂家停产与替代说明 | [厂家原站](https://www.adox.de/discontinued-products/) |
| ADOX · CHS 25 | — | 产品/工艺说明 | 厂家明确停产 | 厂家停产与替代说明 | [厂家原站](https://www.adox.de/discontinued-products/) |
| ADOX · CHS 50 | — | 产品/工艺说明 | 厂家明确停产 | 厂家停产与替代说明 | [厂家原站](https://www.adox.de/discontinued-products/) |
| ADOX · CHS ORTHO 25 | — | 产品/工艺说明 | 厂家明确停产 | 厂家停产与替代说明 | [厂家原站](https://www.adox.de/discontinued-products/) |
| ADOX · CMS 20 II | — | 产品/工艺说明 | 原站列出 | 感光类型/工艺与使用说明 | [厂家原站](https://www.adox.de/en/) |
| ADOX · HR-50 | — | 产品/工艺说明 | 原站列出 | 感光类型/工艺与使用说明 | [厂家原站](https://www.adox.de/en/) |
| ADOX · SCALA 160 | — | 产品/工艺说明 | 原站列出 | 感光类型/工艺与使用说明 | [厂家原站](https://www.adox.de/en/) |
| ADOX · SCALA 50 | — | 产品/工艺说明 | 原站列出 | 感光类型/工艺与使用说明 | [厂家原站](https://www.adox.de/en/) |
| ADOX · SILVERMAX | — | 产品/工艺说明 | 厂家明确停产 | 厂家停产与替代说明 | [厂家原站](https://www.adox.de/discontinued-products/) |
| AgfaPhoto · APX 100 | — | 产品/工艺说明 | 原站列出 | 品牌产品目录 | [厂家原站](https://agfaphoto.com/en/analog-photography-single-use-cameras/) |
| AgfaPhoto · APX 400 | — | 产品/工艺说明 | 原站列出 | 品牌产品目录 | [厂家原站](https://agfaphoto.com/en/analog-photography-single-use-cameras/) |
| Astrum · FN-64 | — | 身份线索/缺口 | 待核验 | 2026社区团购身份线索 | 原站不可用，见缺口 |
| Astrum · Foto 100 | — | 身份线索/缺口 | 待核验 | 2026社区团购身份线索 | 原站不可用，见缺口 |
| Bergger · PANCRO 400 | — | 技术图表（未数字化） | 原站列出 | 光谱感度曲线 / 密度-相对对数曝光曲线 / 显影时间/温度表 / 双乳剂结构说明 | [厂家原站](https://bergger.com/en/index.php?controller=attachment&id_attachment=4) |
| CatLABS · X FILM 320 Pro | — | 产品/工艺说明 | 原站列出 | 品牌使用与显影说明 | [厂家原站](https://www.catlabs.info/category/film) |
| CatLABS · X FILM 80 MKII | — | 产品/工艺说明 | 原站列出 | 品牌使用与显影说明 | [厂家原站](https://www.catlabs.info/category/film) |
| CatLABS · X Pan 320 Pro | — | 产品/工艺说明 | 原站列出 | 品牌使用与显影说明 | [厂家原站](https://www.catlabs.info/category/film) |
| Ferrania · ORTO | — | 身份线索/缺口 | 待核验 | 论坛工艺讨论入口 | [社区](https://www.photrio.com/forum/threads/ferrania-p30-p33-orto-pmk-dev-times.219044/) |
| Ferrania · P30 | — | 产品/工艺说明 | 历史文献 | 曝光与显影使用指引 | [厂家原站](https://www.filmferrania.com/p30-info) |
| Ferrania · P33 | — | 产品/工艺说明 | 历史文献 | 显影条件 / 反差指数（不同药水/工艺） | [厂家原著镜像](https://www.macodirect.de/media/pdf/45/5b/2d/FP3311_Datenblatt_d.pdf) |
| Film Washi · D 500 | — | 产品/工艺说明 | 待核验 | 品牌感光类型/来源/工艺说明 | [厂家原站](https://filmwashi.com/en/products/135_films/) |
| Film Washi · E 3 | — | 产品/工艺说明 | 原站列出 | 品牌感光类型/来源/工艺说明 | [厂家原站](https://filmwashi.com/en/products/120_films/) |
| Film Washi · F 100 | — | 产品/工艺说明 | 原站列出 | 品牌感光类型/来源/工艺说明 | [厂家原站](https://filmwashi.com/en/products/120_films/) |
| Film Washi · I 80 | — | 产品/工艺说明 | 原站列出 | 品牌感光类型/来源/工艺说明 | [厂家原站](https://filmwashi.com/en/products/120_films/) |
| Film Washi · K 100 | — | 产品/工艺说明 | 原站列出 | 品牌感光类型/来源/工艺说明 | [厂家原站](https://filmwashi.com/en/products/120_films/) |
| Film Washi · Z 400 | — | 产品/工艺说明 | 原站列出 | 品牌感光类型/来源/工艺说明 | [厂家原站](https://filmwashi.com/en/products/135_films/) |
| FilmNeverDie · KURO BW 100 | — | 产品/工艺说明 | 原站列出 | 品牌正式黑白100型号 | [品牌原站](https://filmneverdie.com/pages/bulk-fnd-films-buy) |
| FilmNeverDie · YORU BW 400 | — | 产品/工艺说明 | 原站列出 | 品牌正式黑白400型号 | [品牌原站](https://filmneverdie.com/pages/bulk-fnd-films-buy) |
| Foma · FOMA Ortho 400 | — | 技术图表（未数字化） | 原站列出 | 相对光谱感度曲线 / 感光特性曲线（密度-曝光） / 显影药水/时间/温度条件 | [厂家原站](https://www.foma.cz/produkty-cernobile-filmy-22) |
| Foma · FOMAPAN 100 Classic | — | 技术图表（未数字化） | 原站列出 | 相对光谱感度曲线 / 感光特性曲线（密度-曝光） / 显影药水/时间/温度条件 | [厂家原站](https://www.foma.cz/produkty-cernobile-filmy-22) |
| Foma · FOMAPAN 200 Creative | — | 技术图表（未数字化） | 原站列出 | 相对光谱感度曲线 / 感光特性曲线（密度-曝光） / 显影药水/时间/温度条件 | [厂家原站](https://www.foma.cz/produkty-cernobile-filmy-22) |
| Foma · FOMAPAN 400 Action | — | 技术图表（未数字化） | 原站列出 | 相对光谱感度曲线 / 感光特性曲线（密度-曝光） / 显影药水/时间/温度条件 | [厂家原站](https://www.foma.cz/produkty-cernobile-filmy-22) |
| Foma · RETROPAN 320 soft | — | 技术图表（未数字化） | 原站列出 | 相对光谱感度曲线 / 感光特性曲线（不同显影时间） / 显影条件 | [厂家原站](https://www.foma.cz/produkty-cernobile-filmy-22) |
| Fujifilm · MINICOPY HR II | ミニコピーフィルムHRII（シート） | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 相反律 / 显影条件 | [厂家原站](https://asset.fujifilm.com/www/jp/files/2019-12/06c270fb14707f323716dfe488e3d06d/datasheet_minicopyfilmhrii_01.pdf) |
| Fujifilm · NEOPAN 100 ACROS | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 相反律 / 显影条件 | [厂家原著镜像](https://125px.com/docs/film/fuji/Acros-120_AF3-083E.pdf) |
| Fujifilm · NEOPAN 100 ACROS II | ネオパン 100 ACROS Ⅱ（135） / ネオパン 100 ACROS Ⅱ（120） | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 相反律 / 显影条件 | [厂家原站](https://asset.fujifilm.com/www/jp/files/2024-04/91c9aca91605666e5b8b749b928a94fb/datasheet_neopan100acros2_120_01.pdf) |
| Fujifilm · Neopan 1600 | — | 产品/工艺说明 | 历史文献 | 无专属曲线 | [厂家原著镜像](https://125px.com/docs/film/fuji/Neopan1600.pdf) |
| Fujifilm · NEOPAN 1600 Super PRESTO | ネオパン 1600 Super PRESTO（日本語） / ネオパン 1600 Super PRESTO（英語） | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 相反律 / 显影条件 | [厂家原站](https://asset.fujifilm.com/www/jp/files/2019-12/a80cda9888a206303c836f7ffd99709b/datasheet_neopan1600superpresto_en_01.pdf) |
| Fujifilm · Neopan 400 | — | 产品/工艺说明 | 历史文献 | 无专属曲线 | [厂家原著镜像](https://125px.com/docs/film/fuji/Neopan400.pdf) |
| Fujifilm · NEOPAN 400 PRESTO | ネオパン 400 PRESTO（135） / ネオパン 400 PRESTO（120） | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 相反律 / 显影条件 | [厂家原站](https://asset.fujifilm.com/www/jp/files/2019-12/a9c8f2ff6b7bbf06b060018416cef995/datasheet_neopan400presto120_01.pdf) |
| Fujifilm · NEOPAN ORTHO | ネオパンオルソ（シート） | 产品/工艺说明 | 历史文献 | 无专属曲线 | [厂家原站](https://asset.fujifilm.com/www/jp/files/2019-12/719e74fb2058f3fad8c901af33d5cbcb/datasheet_neopanortho_01.pdf) |
| Fujifilm · NEOPAN SS | ネオパン SS（日本語） / ネオパン SS（英語） | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 相反律 / 显影条件 | [厂家原站](https://asset.fujifilm.com/www/jp/files/2019-12/5cff4aeedafee45ce703f57552de76e6/datasheet_neopanss_en_01.pdf) |
| ILFORD · DELTA 100 PROFESSIONAL | — | 技术图表（未数字化） | 原站列出 | 显影条件 / 光谱感度图 | [厂家原站](https://www.ilfordphoto.com/technical-data/) |
| ILFORD · DELTA 3200 PROFESSIONAL | — | 技术图表（未数字化） | 原站列出 | 显影条件 / 光谱感度图 / 特性曲线 | [厂家原站](https://www.ilfordphoto.com/technical-data/) |
| ILFORD · DELTA 400 PROFESSIONAL | — | 产品/工艺说明 | 原站列出 | 厂家技术表入口（未读到正文） | [厂家原站](https://www.ilfordphoto.com/technical-data/) |
| ILFORD · FP4 PLUS | — | 技术图表（未数字化） | 原站列出 | 显影条件 / 光谱感度图 / 特性曲线 | [厂家原站](https://www.ilfordphoto.com/technical-data/) |
| ILFORD · HP5 PLUS | — | 技术图表（未数字化） | 原站列出 | 显影条件 / 光谱感度图 / 特性曲线 | [厂家原站](https://www.ilfordphoto.com/technical-data/) |
| ILFORD · ORTHO PLUS | — | 技术图表（未数字化） | 原站列出 | 显影条件 / 光谱感度图 | [厂家原站](https://www.ilfordphoto.com/technical-data/) |
| ILFORD · PAN 100 | — | 产品/工艺说明 | 历史文献 | 显影条件（ILFOSOL3药水技术表中的对应胶片条目） | [厂家原站](https://www.ilfordphoto.com/amfile/file/download/file/572/product/542/) |
| ILFORD · PAN 400 | — | 产品/工艺说明 | 历史文献 | 显影条件（ILFOSOL3药水技术表中的对应胶片条目） | [厂家原站](https://www.ilfordphoto.com/amfile/file/download/file/572/product/542/) |
| ILFORD · PAN F PLUS | — | 技术图表（未数字化） | 原站列出 | 显影条件 / 光谱感度图 / 特性曲线 | [厂家原站](https://www.ilfordphoto.com/technical-data/) |
| ILFORD · SFX 200 | — | 技术图表（未数字化） | 原站列出 | 显影条件 / 光谱感度图 | [厂家原站](https://www.ilfordphoto.com/technical-data/) |
| ILFORD · XP2 SUPER | — | 技术图表（未数字化） | 原站列出 | 显影条件 / 光谱感度图 | [厂家原站](https://www.ilfordphoto.com/technical-data/) |
| JCH · StreetPan 400 | — | 身份线索/缺口 | 历史文献 | 品牌历史型号 / 社区H+D曲线：EI200/补充式XTOL/24℃/17:30/JOBO | [品牌原站](https://www.japancamerahunter.com/2016/03/film-news-announcing-jch-streetpan-400-film/) |
| Kentmere · PAN 100 | — | 技术图表（未数字化） | 原站列出 | 显影条件 / 光谱感度图 | [厂家原站](https://www.ilfordphoto.com/technical-data/) |
| Kentmere · PAN 200 | — | 技术图表（未数字化） | 原站列出 | 显影条件 / 光谱感度图 | [厂家原站](https://www.ilfordphoto.com/technical-data/) |
| Kentmere · PAN 400 | — | 技术图表（未数字化） | 原站列出 | 显影条件 / 光谱感度图 | [厂家原站](https://www.ilfordphoto.com/technical-data/) |
| Kodak · BW400CN | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原著镜像](https://125px.com/docs/film/kodak/f4036-BW400CN.pdf) |
| Kodak · Commercial Film | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 相反律 / 显影条件 | [厂家原著镜像](https://125px.com/docs/film/kodak/f16-Commercial.pdf) |
| Kodak · Ektagraphic HC | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 相反律 | [厂家原著镜像](https://125px.com/docs/film/kodak/f12-Ektagraphic_HC.pdf) |
| Kodak · EKTAPAN 100 | — | 产品/工艺说明 | 原站列出 | 无专属曲线 | [厂家原站](https://www.kodak.com/en/still-film/product/professional/ektapan/ektapan-100-film/) |
| Kodak · EKTAPAN 400 | — | 产品/工艺说明 | 原站列出 | 无专属曲线 | [厂家原站](https://www.kodak.com/en/still-film/product/professional/ektapan/ektapan-400-film/) |
| Kodak · EKTAPAN EKP (historical) | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 相反律 / 显影条件 | [厂家原著镜像](https://125px.com/docs/film/kodak/f10-Ektapan.pdf) |
| Kodak · EKTAPAN P3200 | — | 产品/工艺说明 | 原站列出 | 无专属曲线 | [厂家原站](https://www.kodak.com/en/still-film/product/professional/ektapan/ektapan-p3200-film/) |
| Kodak · High Speed Infrared | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / MTF / 显影条件 | [厂家原著镜像](https://125px.com/docs/film/kodak/f13-HIE.pdf) |
| Kodak · Plus-X | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 相反律 / 显影条件 | [厂家原著镜像](https://125px.com/docs/film/kodak/f4018-125PX-2007.pdf) |
| Kodak · Plus-X Pan | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / MTF / 相反律 / 显影条件 | [厂家原著镜像](https://125px.com/docs/film/kodak/f8-Plus-X_Pan.pdf) |
| Kodak · Plus-X Pan Professional | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / MTF / 相反律 / 显影条件 | [厂家原著镜像](https://125px.com/docs/film/kodak/f8-Plus-X_Pan.pdf) |
| Kodak · Portra 400BW | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / 相反律 | [厂家原著镜像](https://125px.com/docs/film/kodak/f4012-Portra_400BW.pdf) |
| Kodak · Professional Copy Film | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 相反律 / 显影条件 | [厂家原著镜像](https://125px.com/docs/film/kodak/f17-Copy.pdf) |
| Kodak · T-MAX 100 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / MTF / 相反律 / 显影条件 | [厂家原站](https://www.kodakprofessional.com/sites/default/files/wysiwyg/pro/resources/f4016_TMax_100.pdf) |
| Kodak · T-MAX 400 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / MTF / 相反律 / 显影条件 | [厂家原站](https://www.kodakprofessional.com/sites/default/files/wysiwyg/pro/resources/f4043_TMax_400.pdf) |
| Kodak · T-MAX P3200 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / MTF / 相反律 / 显影条件 | [厂家原著镜像](https://125px.com/docs/film/kodak/f4001-P3200TMZ-2019.pdf) |
| Kodak · T400CN | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / 相反律 | [厂家原著镜像](https://125px.com/docs/film/kodak/f2350-T400CN.pdf) |
| Kodak · Technical Pan | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / MTF / 相反律 / 显影条件 | [厂家原著镜像](https://125px.com/docs/film/kodak/p255-2003_06.pdf) |
| Kodak · Tri-X 320 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / MTF / 相反律 / 显影条件 | [厂家原站](https://www.kodakprofessional.com/sites/default/files/wysiwyg/pro/resources/f4017_TriX.pdf) |
| Kodak · Tri-X 400 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / MTF / 相反律 / 显影条件 | [厂家原站](https://www.kodakprofessional.com/sites/default/files/wysiwyg/pro/resources/f4017_TriX.pdf) |
| Kodak · Tri-X Pan | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / MTF / 相反律 / 显影条件 | [厂家原著镜像](https://125px.com/docs/film/kodak/f9-Tri-X_Pan.pdf) |
| Kodak · Tri-X Pan Professional | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / MTF / 相反律 / 显影条件 | [厂家原著镜像](https://125px.com/docs/film/kodak/f9-Tri-X_Pan.pdf) |
| Kodak · Verichrome Pan | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 相反律 / 显影条件 | [厂家原著镜像](https://125px.com/docs/film/kodak/f7-Verichrome.pdf) |
| Leica · MONOPAN 50 | — | 技术图表（未数字化） | 原站列出 | 光谱感度图 / 显影时间/药水/温度/搅动 / 伽玛条件 / 长曝光补偿 | [厂家原站](https://leica-camera.com/en-int/photography/accessories/m/film/monopan-50/technical-specification) |
| Lucky · SHD 100 | — | 身份线索/缺口 | 待核验 | 品牌商城产品检索条目 | [厂家原站](https://www.lucky.cn/index/home) |
| Lucky · SHD 400 | — | 身份线索/缺口 | 待核验 | 品牌商城产品检索条目 | [厂家原站](https://www.lucky.cn/index/home) |
| Reflx Lab · DOUBLE X (5222) | — | 产品/工艺说明 | 原站列出 | 品牌明确5222代码 | [品牌原站](https://reflxlab.com/en-de/collections/135-film) |
| Reflx Lab · ZARYA 100 | — | 产品/工艺说明 | 原站列出 | 品牌目录100黑白型号 | [品牌原站](https://reflxlab.com/en-de/collections/135-film) |
| Reflx Lab · ZARYA 400 | — | 产品/工艺说明 | 原站列出 | 品牌目录400黑白型号 | [品牌原站](https://reflxlab.com/en-de/collections/135-film) |
| RERA/Kawauso · RERAPAN 100 | — | 产品/工艺说明 | 厂家明确停产 | 品牌正式型号/格式 / 品牌供应状态说明 | [品牌原站](https://kawauso.biz/products/list?category_id=114) |
| RERA/Kawauso · RERAPAN 100F | — | 产品/工艺说明 | 原站列出 | 品牌正式型号/格式 / 品牌供应状态说明 | [品牌原站](https://kawauso.biz/products/list?category_id=114) |
| RERA/Kawauso · RERAPAN 100S | — | 产品/工艺说明 | 厂家明确停产 | 品牌正式型号/格式 / 品牌供应状态说明 | [品牌原站](https://kawauso.biz/products/list?category_id=114) |
| RERA/Kawauso · RERAPAN 200 | — | 产品/工艺说明 | 原站列出 | 品牌正式型号/格式 / 品牌供应状态说明 | [品牌原站](https://kawauso.biz/products/list?category_id=114) |
| RERA/Kawauso · RERAPAN 400 | — | 产品/工艺说明 | 原站列出 | 品牌正式型号/格式 / 品牌供应状态说明 | [品牌原站](https://kawauso.biz/products/list?category_id=114) |
| Rollei · INFRARED | — | 技术图表（未数字化） | 原站列出 | 光谱感度图 / 显影时间 / 滤镜与长曝光信息 | [厂家原站](https://www.rolleianalog.com/downloads/?lang=en) |
| Rollei · ORTHO 25 plus | — | 技术图表（未数字化） | 原站列出 | 光谱感度图 / 显影时间 / 滤镜与长曝光信息 | [厂家原站](https://www.rolleianalog.com/downloads/?lang=en) |
| Rollei · RETRO 400S | — | 技术图表（未数字化） | 原站列出 | 光谱感度图 / 显影时间 / 滤镜与长曝光信息 | [厂家原站](https://www.rolleianalog.com/downloads/?lang=en) |
| Rollei · RETRO 80S | — | 技术图表（未数字化） | 原站列出 | 光谱感度图 / 显影时间 / 滤镜与长曝光信息 | [厂家原站](https://www.rolleianalog.com/downloads/?lang=en) |
| Rollei · RPX 100 | — | 技术图表（未数字化） | 原站列出 | 光谱感度图 / 显影时间 / 滤镜与长曝光信息 | [厂家原站](https://www.rolleianalog.com/downloads/?lang=en) |
| Rollei · RPX 25 | — | 技术图表（未数字化） | 原站列出 | 光谱感度图 / 显影时间 / 滤镜与长曝光信息 | [厂家原站](https://www.rolleianalog.com/downloads/?lang=en) |
| Rollei · RPX 400 | — | 技术图表（未数字化） | 原站列出 | 光谱感度图 / 显影时间 / 滤镜与长曝光信息 | [厂家原站](https://www.rolleianalog.com/downloads/?lang=en) |
| Rollei · SUPERPAN 200 | — | 技术图表（未数字化） | 原站列出 | 光谱感度图 / 显影时间 / 滤镜与长曝光信息 | [厂家原站](https://www.rolleianalog.com/downloads/?lang=en) |
| Shanghai · GP3 100 | — | 产品/工艺说明 | 原站列出 | 产品规格与使用信息 | [厂家原站](https://www.shjcfilm.com/) |
| Shanghai · GP3 400 | — | 产品/工艺说明 | 原站列出 | 产品规格与使用信息 | [厂家原站](https://www.shjcfilm.com/) |
| Silberra · PAN 100 | — | 身份线索/缺口 | 待核验 | 品牌历史项目型号摘要 | 原站不可用，见缺口 |
| Silberra · PAN 160 | — | 身份线索/缺口 | 待核验 | 品牌历史项目型号摘要 | 原站不可用，见缺口 |
| Silberra · PAN 200 | — | 身份线索/缺口 | 待核验 | 品牌历史项目型号摘要 | 原站不可用，见缺口 |
| Silberra · PAN 50 | — | 身份线索/缺口 | 待核验 | 品牌历史项目型号摘要 | 原站不可用，见缺口 |
| Street Candy · ATM 400 | — | 产品/工艺说明 | 历史文献 | 日光EI400 / 灯光EI320 / 20℃药水/时间表 / 65/100µm片基版本说明 | 原站不可用，见缺口 |
| Street Candy · MTN 100 | — | 产品/工艺说明 | 历史文献 | 日光EI100 / 灯光EI80 / 负片/反转两种使用方式 / 药水/稀释/时间表 | 原站不可用，见缺口 |

### 电影彩负

| 品牌 · 型号 | 别称/地区名 | 资料层级 | 状态 | 取得的数据类型 | 首要来源 |
|---|---|---|---|---|---|
| FilmNeverDie · KUMO 250D | — | 产品/工艺说明 | 原站列出 | 品牌目录明确ECN-2工艺 / 型号内的感光度/光源标签 | [品牌原站](https://filmneverdie.com/collections/bulk-film) |
| FilmNeverDie · SUIBO 500T | — | 产品/工艺说明 | 原站列出 | 品牌目录明确ECN-2工艺 / 型号内的感光度/光源标签 | [品牌原站](https://filmneverdie.com/collections/bulk-film) |
| Fujifilm · ETERNA 250D 8563/8663 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光源/滤镜条件 / 正式片边与型号代码 | [厂家原著镜像](https://vfxcamdb.com/wp-content/uploads/2015/06/fujifilm_motion_picture_film_manual.pdf) |
| Fujifilm · ETERNA 250T 8553/8653 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光源/滤镜条件 / 正式片边与型号代码 | [厂家原著镜像](https://vfxcamdb.com/wp-content/uploads/2015/06/fujifilm_motion_picture_film_manual.pdf) |
| Fujifilm · ETERNA 400T 8583/8683 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光源/滤镜条件 / 正式片边与型号代码 | [厂家原著镜像](https://vfxcamdb.com/wp-content/uploads/2015/06/fujifilm_motion_picture_film_manual.pdf) |
| Fujifilm · ETERNA 500T 8573/8673 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光源/滤镜条件 / 正式片边与型号代码 | [厂家原著镜像](https://vfxcamdb.com/wp-content/uploads/2015/06/fujifilm_motion_picture_film_manual.pdf) |
| Fujifilm · ETERNA Vivid 160T 8543/8643 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光源/滤镜条件 / 正式片边与型号代码 / 光谱密度/感度 / CTF/RMS | [厂家原著镜像](https://vfxcamdb.com/wp-content/uploads/2015/06/fujifilm_motion_picture_film_manual.pdf) |
| Fujifilm · ETERNA Vivid 250D 8546/8646 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光源/滤镜条件 / 正式片边与型号代码 | [厂家原著镜像](https://vfxcamdb.com/wp-content/uploads/2015/06/fujifilm_motion_picture_film_manual.pdf) |
| Fujifilm · ETERNA Vivid 500T 8547/8647 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光源/滤镜条件 / 正式片边与型号代码 | [厂家原著镜像](https://vfxcamdb.com/wp-content/uploads/2015/06/fujifilm_motion_picture_film_manual.pdf) |
| Fujifilm · F-64D 8522/8622 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光源/滤镜条件 / 正式片边与型号代码 | [厂家原著镜像](https://vfxcamdb.com/wp-content/uploads/2015/06/fujifilm_motion_picture_film_manual.pdf) |
| Fujifilm · REALA 500D 8592/8692 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光源/滤镜条件 / 正式片边与型号代码 | [厂家原著镜像](https://vfxcamdb.com/wp-content/uploads/2015/06/fujifilm_motion_picture_film_manual.pdf) |
| Kodak · 500T Color Negative 5230/7230 | — | 身份线索/缺口 | 历史文献 | 官网身份/历史索引 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · EASTMAN Color Negative 5251 | — | 身份线索/缺口 | 历史文献 | 官网身份/历史索引 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · EASTMAN Color Negative 5254/7254 | — | 身份线索/缺口 | 历史文献 | 官网身份/历史索引 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · EASTMAN Color Negative II 5247/7247 | — | 身份线索/缺口 | 历史文献 | 官网身份/历史索引 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · EXR 100T 5248/7248 | — | 身份线索/缺口 | 历史文献 | 官网身份/历史索引 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · EXR 200T 5293/7293 | — | 身份线索/缺口 | 历史文献 | 官网身份/历史索引 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · EXR 200T Ultra Latitude 5287/7287 | — | 身份线索/缺口 | 历史文献 | 官网身份/历史索引 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · EXR 500T 5296/7296 | — | 身份线索/缺口 | 历史文献 | 官网身份/历史索引 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · EXR 500T 5298/7298 | — | 身份线索/缺口 | 历史文献 | 官网身份/历史索引 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · EXR 50D 5245/7245 | — | 身份线索/缺口 | 历史文献 | 官网身份/历史索引 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · EXR Primetime 640T 5600 | — | 身份线索/缺口 | 历史文献 | 官网身份/历史索引 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · PRIMETIME 640T 5620 | — | 身份线索/缺口 | 历史文献 | 官网身份/历史索引 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · VERITA 200D 5206/7206 | — | 技术图表（未数字化） | 原站列出 | 感光特性曲线 / MTF/RMS图 / 日光平衡 / 与VISION3观感比较 | [厂家原站](https://www.kodak.com/en/motion/product/camera-films/verita-200d-5206-7206/) |
| Kodak · VISION 200T 5274/7274 | — | 身份线索/缺口 | 历史文献 | 官网身份/历史索引 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · VISION 250D 5246/7246 | — | 身份线索/缺口 | 历史文献 | 官网身份/历史索引 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · VISION 320T 5277/7277 | — | 身份线索/缺口 | 历史文献 | 官网身份/历史索引 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · VISION 500T 5263/7263 | — | 身份线索/缺口 | 历史文献 | 官网身份/历史索引 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · VISION 500T 5279/7279 | — | 身份线索/缺口 | 历史文献 | 官网身份/历史索引 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · VISION 800T 5289/7289 | — | 身份线索/缺口 | 历史文献 | 官网身份/历史索引 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · VISION Expression 500T 5284 | — | 身份线索/缺口 | 历史文献 | 官网身份/历史索引 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · VISION2 100T 5212/7212 | — | 身份线索/缺口 | 历史文献 | 官网身份/历史索引 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · VISION2 200T 5217/7217 | — | 身份线索/缺口 | 历史文献 | 官网身份/历史索引 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · VISION2 500T 5218/7218 | — | 身份线索/缺口 | 历史文献 | 官网身份/历史索引 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · VISION2 500T 5260/7260 | — | 身份线索/缺口 | 历史文献 | 官网身份/历史索引 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · VISION2 50D 5201/7201 | — | 身份线索/缺口 | 历史文献 | 官网身份/历史索引 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · VISION2 Expression 500T 5229/7229 | — | 身份线索/缺口 | 历史文献 | 官网身份/历史索引 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · VISION3 200T 5213/7213 | — | 技术图表（未数字化） | 原站列出 | 特性曲线 / 光谱感度/染料密度曲线 / MTF/颗粒相关图 / 光源与ECN-2条件 | [厂家原站](https://www.kodak.com/content/products-brochures/motion-picture/KODAK-VISION3-200T-5213-7213-technical-information.pdf) |
| Kodak · VISION3 250D 5207/7207 | — | 技术图表（未数字化） | 原站列出 | 特性曲线 / 光谱感度/染料密度曲线 / MTF/颗粒相关图 / 光源与ECN-2条件 | [厂家原站](https://www.kodak.com/content/products-brochures/motion-picture/KODAK-VISION3-250D-5207-7207-technical-information.pdf) |
| Kodak · VISION3 500T 5219/7219 | — | 技术图表（未数字化） | 原站列出 | 特性曲线 / 光谱感度/染料密度曲线 / MTF/颗粒相关图 / 光源与ECN-2条件 | [厂家原站](https://www.kodak.com/content/products-brochures/motion-picture/KODAK-VISION3-5219-7219-technical-information.pdf) |
| Kodak · VISION3 50D 5203/7203 | — | 技术图表（未数字化） | 原站列出 | 特性曲线 / 光谱感度/染料密度曲线 / MTF/颗粒相关图 / 光源与ECN-2条件 | [厂家原站](https://www.kodak.com/content/products-brochures/motion-picture/KODAK-VISION3-50D-5203-7203-technical-information.pdf) |
| ORWO · NC500 Colour Cine 35mm | — | 产品/工艺说明 | 待核验 | 厂家产品检索条目 | [厂家原站](https://orwo.shop/products/orwo-nc500-colour-cine-35mm) |
| Reflx Lab · 250D ECN-2 | — | 产品/工艺说明 | 原站列出 | 品牌目录明确ECN-2 | [品牌原站](https://reflxlab.com/en-de/collections/135-film) |

### 电影/兼用反转

| 品牌 · 型号 | 别称/地区名 | 资料层级 | 状态 | 取得的数据类型 | 首要来源 |
|---|---|---|---|---|---|
| ADOX · PAN-X REVERSO SUPER 8 | — | 产品/工艺说明 | 原站列出 | 感光类型/工艺与使用说明 | [厂家原站](https://www.adox.de/en/) |
| Foma · FOMAPAN R 100 | — | 技术图表（未数字化） | 原站列出 | 光谱感度曲线 / 感光特性曲线 / MTF曲线 / R-100正冲工艺 | [厂家原站](https://www.foma.cz/produkty-cernobile-filmy-22) |
| Kodak · EKTACHROME 100D 5285/7285 | — | 身份线索/缺口 | 厂家明确停产 | 官网历史/停产条目 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · EKTACHROME 100D 5294/7294 | — | 技术图表（未数字化） | 原站列出 | 正式型号 / 光源与反转处理条件 / 特性/光谱相关技术图 | [厂家原站](https://www.kodak.com/en/motion/products/camera-films/) |
| Kodak · EKTACHROME 64T 7280 | — | 身份线索/缺口 | 厂家明确停产 | 官网历史/停产条目 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · EKTACHROME Commercial 7252 | — | 身份线索/缺口 | 厂家明确停产 | 官网历史/停产条目 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · EKTACHROME High Speed Daylight 7251 | — | 身份线索/缺口 | 厂家明确停产 | 官网历史/停产条目 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · EKTACHROME High Speed Video News 7250 | — | 身份线索/缺口 | 厂家明确停产 | 官网历史/停产条目 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · EKTACHROME Video News 7239 | — | 身份线索/缺口 | 厂家明确停产 | 官网历史/停产条目 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · EKTACHROME Video News 7240 | — | 身份线索/缺口 | 厂家明确停产 | 官网历史/停产条目 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · KODACHROME 40 Type A 7270/Super8 | — | 身份线索/缺口 | 厂家明确停产 | 官网历史/停产条目 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |

### 电影黑白负片/声底

| 品牌 · 型号 | 别称/地区名 | 资料层级 | 状态 | 取得的数据类型 | 首要来源 |
|---|---|---|---|---|---|
| Film Washi · A 12 | — | 产品/工艺说明 | 厂家明确停产 | 品牌感光类型/来源/工艺说明 | [厂家原站](https://filmwashi.com/en/products/135_films/) |
| Film Washi · S 50 | — | 产品/工艺说明 | 厂家明确停产 | 品牌感光类型/来源/工艺说明 | [厂家原站](https://filmwashi.com/en/products/120_films/) |
| Foma · FOMA Cine Ortho 400 | — | 产品/工艺说明 | 原站列出 | 厂家型号/感光度清单 | [厂家原站](https://www.foma.cz/produkty-cernobile-filmy-22) |
| Foma · FOMAPAN Cine 100 | — | 产品/工艺说明 | 原站列出 | 厂家型号/感光度清单 | [厂家原站](https://www.foma.cz/produkty-cernobile-filmy-22) |
| Foma · FOMAPAN Cine 400 | — | 产品/工艺说明 | 原站列出 | 厂家型号/感光度清单 | [厂家原站](https://www.foma.cz/produkty-cernobile-filmy-22) |
| Kodak · EASTMAN DOUBLE-X 5222/7222 | Double-X / XX | 技术图表（未数字化） | 原站列出 | 特性曲线 / 显影时间/gamma / 颗粒/解析相关图 / D-96条件 | [厂家原站](https://www.kodak.com/content/products-brochures/Film/DOUBLEX-Technical-Data-EN.pdf) |
| Kodak · PLUS-X Negative 5231/7231 | — | 身份线索/缺口 | 厂家明确停产 | 官网历史/停产条目 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · PLUS-X Reversal 7265 | — | 身份线索/缺口 | 厂家明确停产 | 官网历史/停产条目 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · TRI-X Reversal 7266 | — | 技术图表（未数字化） | 原站列出 | 反转处理条件 / 影调/光谱相关技术图 | [厂家原站](https://www.kodak.com/content/products-brochures/motion-picture/KODAK-TRI-X-7266-technical-information.pdf) |
| ORWO · N74 plus | — | 产品/工艺说明 | 待核验 | 厂家显影规程1182索引 | [厂家原站](https://orwo.shop/pages/technical-information) |
| ORWO · UN54 motion negative | — | 产品/工艺说明 | 待核验 | 厂家技术规程索引 / 反转/负片处理适用说明 | [厂家原站](https://orwo.shop/pages/technical-information) |
| ORWO/FilmoTec · N75 | — | 技术图表（未数字化） | 待核验 | ISO320/26°（本文版本） / 1182/D96，平均梯度0.65 / 特性曲线 / 等能光谱感度曲线 | [厂家原站](https://filmotec.de/wp-content/uploads/2022/07/Technische-Info-N75.pdf) |

### 打印/中间/复制材料

| 品牌 · 型号 | 别称/地区名 | 资料层级 | 状态 | 取得的数据类型 | 首要来源 |
|---|---|---|---|---|---|
| Fujifilm · ETERNA-CI | — | 产品/工艺说明 | 历史文献 | 厂家原著历史手册技术页 | [厂家原著镜像](https://vfxcamdb.com/wp-content/uploads/2015/06/fujifilm_motion_picture_film_manual.pdf) |
| Fujifilm · ETERNA-CP 3512 | — | 产品/工艺说明 | 历史文献 | 厂家原著历史手册技术页 | [厂家原著镜像](https://vfxcamdb.com/wp-content/uploads/2015/06/fujifilm_motion_picture_film_manual.pdf) |
| Fujifilm · ETERNA-CP 3514DI | — | 产品/工艺说明 | 历史文献 | 厂家原著历史手册技术页 | [厂家原著镜像](https://vfxcamdb.com/wp-content/uploads/2015/06/fujifilm_motion_picture_film_manual.pdf) |
| Fujifilm · ETERNA-CP 3523XD | — | 产品/工艺说明 | 历史文献 | 厂家原著历史手册技术页 | [厂家原著镜像](https://vfxcamdb.com/wp-content/uploads/2015/06/fujifilm_motion_picture_film_manual.pdf) |
| Fujifilm · ETERNA-RDI | — | 产品/工艺说明 | 历史文献 | 厂家原著历史手册技术页 | [厂家原著镜像](https://vfxcamdb.com/wp-content/uploads/2015/06/fujifilm_motion_picture_film_manual.pdf) |
| Fujifilm · ETERNA-RDS 4791 | — | 产品/工艺说明 | 原站列出 | 黑白分色档案记录用途 / D96/D97适用说明 | [厂家原站](https://www.fujifilm.com/us/en/business/professional-photography/motion-picture-archive-film-product) |
| Kodak · Black-and-White Print 2302/3302 | — | 产品/工艺说明 | 原站列出 | 官方用途分类 / 影调/产品描述 | [厂家原站](https://www.kodak.com/en/motion/products/post/) |
| Kodak · Ektachrome EDUPE | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原著镜像](https://125px.com/docs/film/kodak/e2529-Ektachrome_EDUPE.pdf) |
| Kodak · Fine Grain Duplicating Panchromatic Negative 2234 | — | 产品/工艺说明 | 原站列出 | 官方用途分类 / 影调/产品描述 | [厂家原站](https://www.kodak.com/en/motion/products/post/) |
| Kodak · Fine Grain Duplicating Positive 2366 | — | 产品/工艺说明 | 原站列出 | 官方用途分类 / 影调/产品描述 | [厂家原站](https://www.kodak.com/en/motion/products/post/) |
| Kodak · SO-132 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 显影条件 | [厂家原著镜像](https://125px.com/docs/film/kodak/f11-Duplicating_SO-132.pdf) |
| Kodak · Vericolor slide | — | 产品/工艺说明 | 历史文献 | 无专属曲线 | [厂家原著镜像](https://125px.com/docs/film/kodak/e24-Vericolor.pdf) |
| Kodak · VISION Color Intermediate 2242/3242/5242 | — | 产品/工艺说明 | 原站列出 | 官方用途分类 / 影调/产品描述 | [厂家原站](https://www.kodak.com/en/motion/products/post/) |
| Kodak · VISION Color Print 2383/3383 | — | 产品/工艺说明 | 原站列出 | 官方用途分类 / 影调/产品描述 | [厂家原站](https://www.kodak.com/en/motion/products/post/) |
| Kodak · VISION Premier Color Print 2393 | — | 身份线索/缺口 | 厂家明确停产 | 官网历史/停产条目 | [厂家原站](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| Kodak · VISION3 Color Digital Intermediate 2254 | — | 产品/工艺说明 | 原站列出 | 官方用途分类 / 影调/产品描述 | [厂家原站](https://www.kodak.com/en/motion/products/post/) |
| ORWO · DN2 | — | 产品/工艺说明 | 待核验 | 厂家处理规程适用材料索引 | [厂家原站](https://orwo.shop/pages/technical-information) |
| ORWO · DN21 | — | 产品/工艺说明 | 待核验 | 厂家处理规程适用材料索引 | [厂家原站](https://orwo.shop/pages/technical-information) |
| ORWO · DP3 | — | 产品/工艺说明 | 待核验 | 厂家处理规程适用材料索引 | [厂家原站](https://orwo.shop/pages/technical-information) |
| ORWO · DP31 | — | 产品/工艺说明 | 待核验 | 厂家处理规程适用材料索引 | [厂家原站](https://orwo.shop/pages/technical-information) |
| ORWO · PF2 | — | 产品/工艺说明 | 待核验 | 厂家处理规程适用材料索引 | [厂家原站](https://orwo.shop/pages/technical-information) |
| ORWO · PF2 plus | — | 产品/工艺说明 | 待核验 | 厂家处理规程适用材料索引 | [厂家原站](https://orwo.shop/pages/technical-information) |
| ORWO · TF12d | — | 产品/工艺说明 | 待核验 | 厂家处理规程适用材料索引 | [厂家原站](https://orwo.shop/pages/technical-information) |

### 航空材料

| 品牌 · 型号 | 别称/地区名 | 资料层级 | 状态 | 取得的数据类型 | 首要来源 |
|---|---|---|---|---|---|
| Kodak · AEROCOLOR IV 2460 | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 | [厂家原站](https://www.kodak.com/content/products-brochures/Advanced-Materials/KODAK-AEROCOLOR-III-Negative-Film-2460-datasheet.pdf) |
| Tasma · ТИП 25Л / Type 25L | — | 产品/工艺说明 | 原站列出 | 厂家正式型号 / 黑白等全色航空/专用材料类别 | [厂家原站](https://tasma.ru/products/fotoplenki-i-plenki-spetsialnogo-naznacheniya/) |
| Tasma · ТИП 42Л / Type 42L | — | 产品/工艺说明 | 原站列出 | 厂家正式型号 / 黑白等全色航空/专用材料类别 | [厂家原站](https://tasma.ru/products/fotoplenki-i-plenki-spetsialnogo-naznacheniya/) |

### 特殊感色/创意效果

| 品牌 · 型号 | 别称/地区名 | 资料层级 | 状态 | 取得的数据类型 | 首要来源 |
|---|---|---|---|---|---|
| ADOX · Color Implosion100 | — | 扫描建议起点 | 厂家明确停产 | 品牌改性工艺说明 / 扫描建议 / 明确EOL | [厂家原站](https://www.adox.de/adox-color-implosion-2/) |
| HARMAN · RED 125 | — | 扫描建议起点 | 原站列出 | 红调反装风格 / C41 / 扫描起点 | [厂家原站](https://www.harmanphoto.co.uk/harman-red-125-35mm) |
| HARMAN · Switch Azure125 | — | 扫描建议起点 | 原站列出 | 另类通道感色排列 / HS1800扫描建议 / SP3000扫描建议 / 长曝光补偿 | [厂家原站](https://www.harmanphoto.co.uk/amfile/file/download/file/1969/product/2229/) |
| Kodak · Ektachrome Professional Infrared | — | 技术图表（未数字化） | 历史文献 | 特性曲线 / 光谱感度 / 染料密度 / MTF / 相反律 | [厂家原著镜像](https://125px.com/docs/film/kodak/ti2323-Ektachrome_EIR.pdf) |
| Lomography · Lobster Redscale110 | — | 产品/工艺说明 | 待核验 | 历史品牌专属页 / C41工艺 / 红调样片 | [品牌原站](https://www.lomography.com/magazine/246562-lomopedia-lomography-lobster-redscale-100-iso-110-film) |
| Lomography · LomoChrome Purple ISO100–400 | — | 产品/工艺说明 | 原站列出 | 品牌色彩描述 / 工艺说明 | [品牌原站](https://www.lomography.com/school/what-are-lomochrome-films-fa-g3ebpber) |
| Lomography · LomoChrome Turquoise ISO100–400 | — | 产品/工艺说明 | 原站列出 | 品牌色彩描述 / 工艺说明 | [品牌原站](https://www.lomography.com/school/what-are-lomochrome-films-fa-g3ebpber) |
| Lomography · Redscale XR50–200 | — | 产品/工艺说明 | 历史文献 | 品牌色彩描述 / 工艺说明 | [品牌原站](https://www.lomography.com/magazine/327296-a-guide-to-lomography-films-and-formats) |
| Reflx Lab · DIABLO 100 RED SCALE | — | 产品/工艺说明 | 原站列出 | 品牌红调反装风格说明 | [品牌原站](https://reflxlab.com/en-de/collections/135-film) |

## 单列的纸基材料

以下不是透明胶片，不纳入透明胶片记录数。

- Film Washi R 100：[Film Washi 官方135产品目录](https://filmwashi.com/en/products/135_films/)。Reversal photographic paper in 135；专业工业片、纸基或过期母卷必须独立记录，页面列出不等于现货；R是装入相机的纸基反转材料，不是透明胶片。
- Film Washi V 100：[Film Washi 官方120产品目录](https://filmwashi.com/en/products/120_films/)。Gampi paper panchromatic；专业工业片、纸基或过期母卷必须独立记录，页面列出不等于现货；R是装入相机的纸基反转材料，不是透明胶片。
- Film Washi W 25：[Film Washi 官方120产品目录](https://filmwashi.com/en/products/120_films/)。Kozo paper orthochromatic；专业工业片、纸基或过期母卷必须独立记录，页面列出不等于现货；R是装入相机的纸基反转材料，不是透明胶片。
- Film Washi Y 100：[Film Washi 官方120产品目录](https://filmwashi.com/en/products/120_films/)。Kozo paper panchromatic；专业工业片、纸基或过期母卷必须独立记录，页面列出不等于现货；R是装入相机的纸基反转材料，不是透明胶片。

## 仍存在的缺口

以下缺口是检索记录，不能用论坛转述补成厂家数据。

- 全球历史型号不存在一份已核验全集；未找到的不是不存在。
- ColorPlus200专属技术表未取得；ProImage100原站旧链404，已读取厂家1997原著镜像，不据此证明当前批次不变。
- 部分旧日本PDF为扫描页，仅完成资料身份和文件核验，图表需人工读图。
- ILFORD PAN100/400已补充厂家药水显影条目，但独立胶片特性表待核验。
- 乐凯SHD仅商城摘要，复产批次与厂家曲线缺口保留。
- 未完整覆盖历史Agfa APX、Efke/ORWO摄影片、Silberra所有型号；不得称世界全量。
- 黑白电影用途在category与process区分；Washi W/Y/V/R使用materialKind=paper，不计透明胶片。
- Ferrania P33有厂家编制资料的经销商镜像，原站不可读；ORTO保留社区级缺口。
- 尚未穷尽全球所有乳剂及代工/分装品牌，未宣称完整全集。
- Ferrania Solaris原表、Agfa消费表正文、Konica多数型号原表仍待补。
- Phoenix100未核到正式产品，100常是EI建议；现官网Phoenix125为正式条目。
- 乐凯C200制造商原曲线未取到。
- NC400电影型号尚待取得厂家原页，不用百科或分销商猜测填成已核验曲线。
- FUJIFILM Super-F等更早F125T/F250T/F400T/F500T完整原始技术表仍待补；此次只有F64D及ETERNA/REALA历史手册确认。
- EXR/VISION/VISION2等大部分只核验官网历史型号，尚待逐款历史技术表；evidenceLevel=gap不可作曲线资源计数。
- 未收集航摄卷，避免把各类监督/交通监控材料误标为航摄；由主任务统一覆盖。
- 原料与分装品牌不是一对一；去碳、AHU、ECN2/C41交叉冲洗、过期存储分别建条件，不能仅凭别称或感光度合并。
- 旧5219 remjet版已由主任务此前缓存，2026 AHU版不能覆盖旧版本。
- Flic Film Aurora/UltraPan/Chrome系列原站本轮不可用，仅检索到零售/社区描述，未为凑数扩为曲线条目。
- Svema历史苏联乳剂与Astrum现代销售产品仍需原始档案；不将两品牌视为完全同一。Foto200/400未补原始技术资料。
- Silberra旧域名当前漂移；Ultima系列完整资料与彩色50/100/160等本轮没有可靠原始证据，保留后续检索。
- StreetCandy使用/显影PDF没有特性点集，虽为datasheet也不能计“有曲线”。
- Reflx与FilmNeverDie是销售品牌，个别品牌明确原料关系可以登记，但大部分不得由速度、名字、论坛推测独立乳剂或与Kodak同一。
- 品牌目录某款同时显示Soldout/Addtocart等模板，本轮仅记官网列出，不作当前库存断言。

## 如何用于后续校色开发

资料归属 Java 引擎校色研究和验收准备；不修改 Electron/前端权限，不让生产应用依赖外网。没有增加新的运行时配置目录或抽象层。
先选定胶片版本与实际工艺，再将厂家曲线数字化并标定坐标；结合光源、片基与相机/扫描响应，使用同画面的翻拍RAW与扫描成片做配对验证。
验证后的处理才进入既有 `RenderRecipe.imageProcessing`；预览、单图与批量导出保持同源。普通照片与零调整默认不改色。
本轮只收集文献、扫描参数与来源关系，**没有制作“所有胶片通用LUT”，没有宣称已实现胶卷专属还原**。

## 验证与复现

JSON与CSV按同一清单生成。检查型号ID唯一、来源引用闭合、分类/供应状态合法、纸基统计排除、扫描参数设备与版本分离；本机缓存核验PDF头、页数与SHA-256。
原片始终只读；未上传私人扫描图。纯研究文档变更不运行与本次无关的应用测试。

## 来源总索引

| 来源ID | 类型 | 读取状态 | 文档/帖子 |
|---|---|---|---|
| kf-1307cebdd2c7 | 厂家原著镜像 | read | [T-MAX 100](https://125px.com/docs/film/kodak/f4016_tmax_100-2018.pdf) |
| kf-2396df937c01 | 厂家原著镜像 | read | [Tri-X 320 / Tri-X 400](https://125px.com/docs/film/kodak/f4017-2016.pdf) |
| kf-4bc8f81b3f73 | 厂家原著镜像 | read | [T-MAX 400](https://125px.com/docs/film/kodak/f4043_TMax_400-2016.pdf) |
| kf-2d3e997dad49 | 厂家原著镜像 | read | [T-MAX P3200](https://125px.com/docs/film/kodak/f4001-P3200TMZ-2019.pdf) |
| kf-c287b2e31735 | 厂家原著镜像 | read | [T-MAX 100 / T-MAX P3200](https://125px.com/docs/film/kodak/f4016-TMAX-2007b.pdf) |
| kf-1e881456190e | 厂家原著镜像 | read | [T-MAX 100](https://125px.com/docs/film/kodak/f4016_TMax_100-2016.pdf) |
| kf-ba4ce834a511 | 厂家原著镜像 | read | [Tri-X 320 / Tri-X 400](https://125px.com/docs/film/kodak/f4017-400TX-2005.pdf) |
| kf-8a128e3b99f1 | 厂家原著镜像 | read | [Tri-X 320 / Tri-X 400](https://125px.com/docs/film/kodak/f4017-400TX-2007.pdf) |
| kf-abab92f80484 | 厂家原著镜像 | read | [T-MAX 400](https://125px.com/docs/film/kodak/f4043-TMAX_400-2007.pdf) |
| kf-7f6c3febe407 | 厂家原著镜像 | read | [T-MAX P3200](https://125px.com/docs/film/kodak/F4001-P3200TMZ-2018.pdf) |
| kf-da39a8facd03 | 厂家原著镜像 | read | [T-MAX films / T-MAX 400](https://125px.com/docs/film/kodak/f4016-TMAX-2007a.pdf) |
| kf-122bfc145d05 | 厂家原著镜像 | read | [Professional Copy Film](https://125px.com/docs/film/kodak/f17-Copy.pdf) |
| kf-9d8c0bff898c | 厂家原著镜像 | read | [Technical Pan / P-255](https://125px.com/docs/film/kodak/p255-2003_06.pdf) |
| kf-54fdcd80dbfb | 厂家原著镜像 | read | [Commerical film](https://125px.com/docs/film/kodak/f16-Commercial.pdf) |
| kf-beea96e4284c | 厂家原著镜像 | read | [Ektapan](https://125px.com/docs/film/kodak/f10-Ektapan.pdf) |
| kf-e75adaff55a7 | 厂家原著镜像 | read | [T-MAX 100 / T-MAX 400 / T-MAX P3200 / T-MAX films](https://125px.com/docs/film/kodak/f32-TMAX.pdf) |
| kf-c21300bbf495 | 厂家原著镜像 | read | [Plus-X](https://125px.com/docs/film/kodak/f4018-125PX-2007.pdf) |
| kf-aef564a3a7de | 厂家原著镜像 | read | [Verichrome Pan](https://125px.com/docs/film/kodak/f7-Verichrome.pdf) |
| kf-7f00defdea15 | 厂家原著镜像 | read | [Plus-X Pan / Plus-X Pan Professional](https://125px.com/docs/film/kodak/f8-Plus-X_Pan.pdf) |
| kf-3416218384b8 | 厂家原著镜像 | read | [Tri-X Pan Professional / Tri-X Pan](https://125px.com/docs/film/kodak/f9-Tri-X_Pan.pdf) |
| kf-a936dbfdd1eb | 厂家原著镜像 | read | [SO-132](https://125px.com/docs/film/kodak/f11-Duplicating_SO-132.pdf) |
| kf-0c02ce7d6a9c | 厂家原著镜像 | read | [Ektagraphic HC](https://125px.com/docs/film/kodak/f12-Ektagraphic_HC.pdf) |
| kf-007580ea65cf | 厂家原著镜像 | read | [High Speed Infrared](https://125px.com/docs/film/kodak/f13-HIE.pdf) |
| kf-c80904b209da | 厂家原著镜像 | read | [Technical Pan / P-255](https://125px.com/docs/film/kodak/p255-2000_02.pdf) |
| kf-3ad23b59de76 | 厂家原著镜像 | read | [Technical Pan / P-255](https://125px.com/docs/film/kodak/p255-2001_05.pdf) |
| kf-14fc7de59e6f | 厂家原著镜像 | read | [Ektapan](https://125px.com/docs/film/kodak/f10-Ektapan-199710.pdf) |
| kf-de2ae51242bf | 厂家原著镜像 | read | [Plux-X](https://125px.com/docs/film/kodak/f4018-125PX-2002.pdf) |
| kf-f4e5f14c6966 | 厂家原著镜像 | read | [Verichrome Pan](https://125px.com/docs/film/kodak/f7-Verichrome-199611.pdf) |
| kf-1122453a7ff0 | 厂家原著镜像 | read | [Plus-X Pan / Plus-X Pan Professional](https://125px.com/docs/film/kodak/f8-Plus-X_Pan-199709.pdf) |
| kf-4b1e7417a38b | 厂家原著镜像 | read | [Tri-X Pan Professional / Tri-X Pan](https://125px.com/docs/film/kodak/f9-Tri-X_Pan-199906.pdf) |
| kf-b9ece0250d7a | 厂家原著镜像 | read | [Kodak Recording Film 2475](https://125px.com/docs/film/kodak/2475.pdf) |
| kf-3611cb4610a5 | 厂家原著镜像 | read | [SO-132](https://125px.com/docs/film/kodak/f11-Duplicating_SO-132-200105.pdf) |
| kf-6802765cac1b | 厂家原著镜像 | read | [High Speed Infrared](https://125px.com/docs/film/kodak/f13-HIE-200006.pdf) |
| kf-398576d7c682 | 厂家原著镜像 | read | [Ektar 100](https://125px.com/docs/film/kodak/e4046_ektar_100-2016.pdf) |
| kf-d338c5611678 | 厂家原著镜像 | read | [Portra 160](https://125px.com/docs/film/kodak/e4051_Portra_160-2016.pdf) |
| kf-c9bfbafe8e10 | 厂家原著镜像 | read | [Gold 200](https://125px.com/docs/film/kodak/E7022_Gold_200-2016.pdf) |
| kf-08b04eb1f138 | 厂家原著镜像 | read | [Portra 400](https://125px.com/docs/film/kodak/e4050_portra_400-2016.pdf) |
| kf-6a9db60ed732 | 厂家原著镜像 | read | [Ultra Max 400](https://125px.com/docs/film/kodak/E7023_max_400-2016.pdf) |
| kf-e82709592d33 | 厂家原著镜像 | read | [Portra 800](https://125px.com/docs/film/kodak/e4040_portra_800-2016.pdf) |
| kf-0f4a644208ed | 厂家原著镜像 | read | [Ultra Max 800](https://125px.com/docs/film/kodak/E7024-Ultra_Max_800.pdf) |
| kf-60a68f28b038 | 厂家原著镜像 | read | [Ektar 100](https://125px.com/docs/film/kodak/e4046-EKTAR-2008.pdf) |
| kf-eb428aa2dc6e | 厂家原著镜像 | read | [Ektar 100](https://125px.com/docs/film/kodak/e4046-EKTAR-2009.pdf) |
| kf-062be863d2d1 | 厂家原著镜像 | read | [Ektar 100](https://125px.com/docs/film/kodak/e4046-EKTAR-2010.pdf) |
| kf-f4dd1b3db0de | 厂家原著镜像 | read | [Portra 160](https://125px.com/docs/film/kodak/e4051-Portra-160.pdf) |
| kf-970226d18e15 | 厂家原著镜像 | read | [Gold 200 / Gold 100](https://125px.com/docs/film/kodak/E7022-Gold_100_200.pdf) |
| kf-ba8d56604740 | 厂家原著镜像 | read | [Portra 400](https://125px.com/docs/film/kodak/e4050-Portra-400.pdf) |
| kf-dfc79f892dd0 | 厂家原著镜像 | read | [Ultra Max 400](https://125px.com/docs/film/kodak/E7019_en-Ultra_Max_400.pdf) |
| kf-24272f8fade5 | 厂家原著镜像 | read | [Ultra Max 400](https://125px.com/docs/film/kodak/E7023-Ultra_Max_400.pdf) |
| kf-eb6cb61e7a1f | 厂家原著镜像 | read | [Portra 800 / Portra 160NC / Portra 160VC / Portra 400NC / Portra 400VC](https://125px.com/docs/film/kodak/e4040-Portra-2009.pdf) |
| kf-2c79377cc84e | 厂家原著镜像 | read | [Royal Gold 25](https://125px.com/docs/film/kodak/e40-1996_12.pdf) |
| kf-174bfb4877c6 | 厂家原著镜像 | read | [Bright Sun / GA](https://125px.com/docs/film/kodak/e2328-GA100.pdf) |
| kf-772ed1c02699 | 厂家原著镜像 | read | [Portra 100T](https://125px.com/docs/film/kodak/e2468-Portra_100T.pdf) |
| kf-497bdf1f5639 | 厂家原著镜像 | read | [Pro 100T](https://125px.com/docs/film/kodak/e29-Pro_100T_PRT.pdf) |
| kf-bfd99f3cdf57 | 厂家原著镜像 | read | [Profoto 100](https://125px.com/docs/film/kodak/e2e-Profoto_100.pdf) |
| kf-e1d63de413d2 | 厂家原著镜像 | read | [Ultra Color 100 / Ultra Color 400](https://125px.com/docs/film/kodak/e4035-100UC_400UC.pdf) |
| kf-f61f058d784c | 厂家原著镜像 | read | [Royal Gold 100](https://125px.com/docs/film/kodak/e41-1998_02.pdf) |
| kf-3c8e805096b3 | 厂家原著镜像 | read | [Law Enforcement LE100 / Law Enforcement LE400 / Law Enforcement LE800](https://125px.com/docs/film/kodak/le1-2003_04.pdf) |
| kf-c168ab9a0748 | 厂家原著镜像 | read | [Vericolor III](https://125px.com/docs/film/kodak/e26-Vericolor_III.pdf) |
| kf-f41d7e0083f6 | 厂家原著镜像 | read | [Elite Color 200 / Elite Color 400](https://125px.com/docs/film/kodak/e4039-Elite.pdf) |
| kf-30d1f36bbcb9 | 厂家原著镜像 | read | [Royal Gold 200](https://125px.com/docs/film/kodak/e42-1998_02.pdf) |
| kf-add1bed98476 | 厂家原著镜像 | read | [High Definition 200](https://125px.com/docs/film/kodak/e7017-HD200.pdf) |
| kf-4c0cf82a0e37 | 厂家原著镜像 | read | [Royal Gold 200](https://125px.com/docs/film/kodak/e7006-2002_03.pdf) |
| kf-fffb2b9b22d0 | 厂家原著镜像 | read | [Royal Gold 400](https://125px.com/docs/film/kodak/e2509-2000_01.pdf) |
| kf-4776d3553fba | 厂家原著镜像 | read | [Royal Gold 400](https://125px.com/docs/film/kodak/e43-1998_02.pdf) |
| kf-5894d92b03dd | 厂家原著镜像 | read | [High Definition 400](https://125px.com/docs/film/kodak/e7013-HD400.pdf) |
| kf-9a722a0b6c17 | 厂家原著镜像 | read | [T400CN](https://125px.com/docs/film/kodak/f2350-T400CN.pdf) |
| kf-af7ecd42962d | 厂家原著镜像 | read | [Portra 400BW](https://125px.com/docs/film/kodak/f4012-Portra_400BW.pdf) |
| kf-cbd1a019cc9e | 厂家原著镜像 | read | [BW400CN](https://125px.com/docs/film/kodak/f4036-BW400CN.pdf) |
| kf-532019a0738c | 厂家原著镜像 | read | [Portra 800 / Portra films](https://125px.com/docs/film/kodak/e4040-Portra-2008.pdf) |
| kf-1f0a5f6bfea5 | 厂家原著镜像 | read | [Royal Gold 1000](https://125px.com/docs/film/kodak/e44-1998_02.pdf) |
| kf-7a64c2ff7747 | 厂家原著镜像 | read | [T400CN](https://125px.com/docs/film/kodak/f2350-T400CN-199902.pdf) |
| kf-d1a47fbcb5e2 | 厂家原著镜像 | read | [Ektachrome 64T](https://125px.com/docs/film/kodak/e130-Ektachrome_64T_EPY.pdf) |
| kf-9948c2ef31c3 | 厂家原著镜像 | read | [Ektachrome 64](https://125px.com/docs/film/kodak/e8-Ektachrome_64_EPR.pdf) |
| kf-3c46ae26c47d | 厂家原著镜像 | read | [Ektachrome 100 Plus](https://125px.com/docs/film/kodak/e113-Ektachrome_100_plus_EPP.pdf) |
| kf-d84dabfc40eb | 厂家原著镜像 | read | [Elitechrome Extra Color 100](https://125px.com/docs/film/kodak/e126e-Elitechrome_100ec.pdf) |
| kf-a8a458cdc9af | 厂家原著镜像 | read | [Ektachrome E100VS](https://125px.com/docs/film/kodak/e163-Ektachrome_E100VS.pdf) |
| kf-e5fb26f4c073 | 厂家原著镜像 | read | [Ektachrome E100G / Ektachrome E100GX](https://125px.com/docs/film/kodak/e4024-2009.pdf) |
| kf-b7ac006ca382 | 厂家原著镜像 | read | [Elitechrome 100](https://125px.com/docs/film/kodak/E7014e-Elitechrome_100.pdf) |
| kf-23f14dcfd151 | 厂家原著镜像 | read | [Ektachrome 160T](https://125px.com/docs/film/kodak/e144-Ektachrome_160T_EPT.pdf) |
| kf-1c6413a83c7e | 厂家原著镜像 | read | [Elitechrome 200](https://125px.com/docs/film/kodak/e148e-Elite_chrome_200.pdf) |
| kf-1a3bcb118804 | 厂家原著镜像 | read | [Ektachrome E200](https://125px.com/docs/film/kodak/e28-Ektachrome_E200.pdf) |
| kf-f1d6bdef9275 | 厂家原著镜像 | read | [Ektachrome 320T](https://125px.com/docs/film/kodak/e145-Ektachrome_320T_EPJ.pdf) |
| kf-aa9e4cf6f079 | 厂家原著镜像 | read | [Elitechrome 400](https://125px.com/docs/film/kodak/e149-Elite_chrome_400.pdf) |
| kf-43fbea974974 | 厂家原著镜像 | read | [Ektachrome 400X](https://125px.com/docs/film/kodak/e161-Ektachrome_400X_EPL.pdf) |
| kf-174eb057079d | 厂家原著镜像 | read | [Ektachrome P1600](https://125px.com/docs/film/kodak/e147-Ektachrome_P1600_EPH.pdf) |
| kf-2621f4374a70 | 厂家原著镜像 | read | [Vericolor slide](https://125px.com/docs/film/kodak/e24-Vericolor.pdf) |
| kf-4726859cf9e0 | 厂家原著镜像 | read | [Ektachrome EDUPE](https://125px.com/docs/film/kodak/e2529-Ektachrome_EDUPE.pdf) |
| kf-18a053af9ef9 | 厂家原著镜像 | read | [Ektachrome Professional Infrared](https://125px.com/docs/film/kodak/ti2323-Ektachrome_EIR.pdf) |
| kf-415b75459c87 | 厂家原著镜像 | read | [Ektachrome E100G / Ektachrome E100GX](https://125px.com/docs/film/kodak/e4024-Ektachrome_E100G.pdf) |
| kf-b0a7cb7180ea | 厂家原著镜像 | read | [Kodachrome 25 Professional / Kodachrome 64 Professional / Kodachrome 200 Professional](https://125px.com/docs/film/kodak/e55-2009_06.pdf) |
| kf-31aceef20440 | 厂家原著镜像 | read | [Kodachrome 25 / Kodachrome 64 / Kodachrome 200](https://125px.com/docs/film/kodak/e88-2002_03.pdf) |
| kf-955006d359ce | 厂家原著镜像 | read | [Kodachrome 64 / Kodachrome 200](https://125px.com/docs/film/kodak/e88-2009_06.pdf) |
| kf-e91db65acff7 | 厂家原著镜像 | read | [Kodachrome 25 Professional / Kodachrome 64 Professional / Kodachrome 200 Professional](https://125px.com/docs/film/kodak/e55-1996_12.pdf) |
| kf-610fb11db582 | 厂家原著镜像 | read | [Kodachrome 25 Professional / Kodachrome 64 Professional / Kodachrome 200 Professional](https://125px.com/docs/film/kodak/e55-2003_08.pdf) |
| kf-d66bfb887876 | 厂家原著镜像 | read | [Kodachrome 25 / Kodachrome 64 / Kodachrome 200](https://125px.com/docs/film/kodak/e88-1998_01.pdf) |
| kf-ad78d0433f9a | 厂家原著镜像 | read | [Kodachrome 64 / Kodachrome 200](https://125px.com/docs/film/kodak/e88-2005_09.pdf) |
| kf-71c017310249 | 厂家原著镜像 | read | [Neopan Acros 100 (120)](https://125px.com/docs/film/fuji/Acros-120_AF3-083E.pdf) |
| kf-385624c0e7d3 | 厂家原著镜像 | read | [Neopan Acros 100](https://125px.com/docs/film/fuji/NeopanAcros100.pdf) |
| kf-ae21fc6f0e5c | 厂家原著镜像 | read | [Neopan 400](https://125px.com/docs/film/fuji/Neopan400.pdf) |
| kf-ad226c007e84 | 厂家原著镜像 | read | [Neopan 1600](https://125px.com/docs/film/fuji/Neopan1600.pdf) |
| kf-0182f9f79b7a | 厂家原著镜像 | read | [Superia 200](https://125px.com/docs/film/fuji/superia_200_datasheet.pdf) |
| kf-268d8f6644b5 | 厂家原著镜像 | read | [Superia X-tra 400](https://125px.com/docs/film/fuji/superia_xtra400_datasheet.pdf) |
| kf-5339f0bf32c9 | 厂家原著镜像 | read | [Pro 400H](https://125px.com/docs/film/fuji/pro_400h_datasheet.pdf) |
| kf-7c07c32f288a | 厂家原著镜像 | read | [Superia X-tra 800](https://125px.com/docs/film/fuji/superia_xtra800_datasheet.pdf) |
| kf-12854747d361 | 厂家原著镜像 | read | [Superia 100](https://125px.com/docs/film/fuji/superia_100_datasheet.pdf) |
| kf-db6723937e50 | 厂家原著镜像 | read | [Superia Reala](https://125px.com/docs/film/fuji/superia_reala_datasheet.pdf) |
| kf-d696ade3cab1 | 厂家原著镜像 | read | [Pro 160 S](https://125px.com/docs/film/fuji/pro_160s_datasheet.pdf) |
| kf-01902731a599 | 厂家原著镜像 | read | [Pro 160 C](https://125px.com/docs/film/fuji/pro_160c_datasheet.pdf) |
| kf-c93bc267423a | 厂家原著镜像 | read | [Pro 160 S](https://125px.com/docs/film/fuji/AF3-203U_Pro160S_Product_Information_Bulletin.pdf) |
| kf-fad520fa67b2 | 厂家原著镜像 | read | [Pro 160 C](https://125px.com/docs/film/fuji/AF3-204U_Pro160C_Product_Information_Bulletin.pdf) |
| kf-14aa33d4f9fb | 厂家原著镜像 | read | [True Definition 400](https://125px.com/docs/film/fuji/True_Definition_DataSheet.pdf) |
| kf-59a4a4b82ab8 | 厂家原著镜像 | read | [NPZ 800](https://125px.com/docs/film/fuji/NPZ.pdf) |
| kf-9344679054ef | 厂家原著镜像 | read | [Pro 800Z](https://125px.com/docs/film/fuji/pro_800z_datasheet.pdf) |
| kf-f800e6f256b9 | 厂家原著镜像 | read | [Superia 1600](https://125px.com/docs/film/fuji/superia_1600_datasheet.pdf) |
| kf-082e5c312383 | 厂家原著镜像 | read | [Velvia 50](https://125px.com/docs/film/fuji/velvia_50_datasheet.pdf) |
| kf-b66674f0a2f8 | 厂家原著镜像 | read | [Velvia 50](https://125px.com/docs/film/fuji/AF3-0221E2Velvia50PIB.pdf) |
| kf-fc9acdb4b773 | 厂家原著镜像 | read | [Provia 100F](https://125px.com/docs/film/fuji/provia_100f_datasheet.pdf) |
| kf-570dad7ad416 | 厂家原著镜像 | read | [Velvia 100](https://125px.com/docs/film/fuji/velvia_100_datasheet.pdf) |
| kf-9275e38111dd | 厂家原著镜像 | read | [T64](https://125px.com/docs/film/fuji/t64_datasheet.pdf) |
| kf-fd0f951443d3 | 厂家原著镜像 | read | [Sensia 100](https://125px.com/docs/film/fuji/sensia_100_datasheet.pdf) |
| kf-a8bc829375bb | 厂家原著镜像 | read | [Velvia 100F](https://125px.com/docs/film/fuji/velvia_100f_datasheet.pdf) |
| kf-42e745399710 | 厂家原著镜像 | read | [Astia 100F](https://125px.com/docs/film/fuji/astia_100f_datasheet.pdf) |
| kf-c01f41ee3c40 | 厂家原著镜像 | read | [Sensia 200](https://125px.com/docs/film/fuji/sensia_200_datasheet.pdf) |
| kf-8214093e9c13 | 厂家原著镜像 | read | [Provia 400X](https://125px.com/docs/film/fuji/Provia_400X_PIB_1007.pdf) |
| kf-a5b5af5fe091 | 厂家原著镜像 | read | [Provia 400F](https://125px.com/docs/film/fuji/PROVIA400FAF3-066E_1.pdf) |
| kf-e2ee45a8a549 | 厂家原著镜像 | read | [Sensia 400](https://125px.com/docs/film/fuji/sensia_400_datasheet.pdf) |
| kf-71af26e3c1f5 | 厂家原著镜像 | read | [Kodak EKTAPRESS PJ100, EKTAPRESS PJ400, EKTAPRESS PJ800, EKTAPRESS PJM Multispeed](https://125px.com/docs/film/kodak/e116-Ektapress.pdf) |
| kf-66cbcb26b249 | 厂家原著镜像 | read | [Kodak Pro 100 PRN, Pro 100T, Pro 400 MC, Pro 400, Pro 1000](https://125px.com/docs/film/kodak/e182-Pro_Films.pdf) |
| kf-ec9bd66bccdf | 厂家原著镜像 | read | [Kodak SUPRA 100, SUPRA 400, SUPRA 800](https://125px.com/docs/film/kodak/e2519-2003_05.pdf) |
| kf-542802936799 | 厂家原著镜像 | read | [Kodak ROYAL SUPRA 200, ROYAL SUPRA 400, ROYAL SUPRA 800](https://125px.com/docs/film/kodak/e4026-2002_06.pdf) |
| kf-88253c7bb6ac | 厂家原著镜像 | read | [Kodak SUPRA 200, SUPRA 400, SUPRA 800](https://125px.com/docs/film/kodak/e4029-2003_05.pdf) |
| kf-110232470985 | 厂家原站 | read | [FUJICOLOR 100 技术表](https://asset.fujifilm.com/www/jp/files/2019-12/05b4b671ff6c0e53b8f7df233d57dfd7/datasheet_fujicolor100_01.pdf) |
| kf-b1a6bf2ccfa7 | 厂家原站 | read | [フジカラー REALA ACE 技术表](https://asset.fujifilm.com/www/jp/files/2024-04/2dca996da7fa6b3e34edda4c943870c2/datasheet_realaace_01.pdf) |
| kf-5203d477b1fe | 厂家原站 | read | [FUJIFILM 400 技术表](https://asset.fujifilm.com/www/jp/files/2024-04/a97a9256fa03c083a1c735495be1bd60/datasheet_fujifilm400_01.pdf) |
| kf-2d342173ef8f | 厂家原站 | read | [フジカラー SUPERIA PREMIUM 400 技术表](https://asset.fujifilm.com/www/jp/files/2019-12/3723e0912cf7e939bb07fd982b0ff9fa/datasheet_superiapremium400_01.pdf) |
| kf-7bafec5a2168 | 厂家原站 | read | [フジカラー SUPERIA X-TRA 400 技术表](https://asset.fujifilm.com/www/jp/files/2024-04/e3d01e65a65f6825eeb14c6bbd05e523/datasheet_superiax-tra400_01.pdf) |
| kf-13b67fa3feba | 厂家原站 | read | [フジカラー SUPERIA Venus 400 技术表](https://asset.fujifilm.com/www/jp/files/2024-04/ec34b04900f0718db637a1bb5a9f019b/datasheet_superiavenus400_01.pdf) |
| kf-9f31d82f5d3a | 厂家原站 | read | [フジカラー SUPERIA Venus 800 技术表](https://asset.fujifilm.com/www/jp/files/2024-04/e19e7b4cc0678c711c9be30803f3f252/datasheet_superiavenus800_01.pdf) |
| kf-81aec77670ff | 厂家原站 | read | [フジカラー NATURA 1600 技术表](https://asset.fujifilm.com/www/jp/files/2024-04/96b634a89ec6a5abda6b70437f4d75a4/datasheet_natura1600_01.pdf) |
| kf-be3e4c1366d6 | 厂家原站 | read | [フジカラー nexia 400 技术表](https://asset.fujifilm.com/www/jp/files/2019-12/b71c82d2ee200a440344c92e78630473/datasheet_nexia400_01.pdf) |
| kf-b541c24dc326 | 厂家原站 | read | [フジカラー nexia ズームマスター 800 技术表](https://asset.fujifilm.com/www/jp/files/2019-12/e83cba09d325b173158e890279d7b919/datasheet_nexiazoommaster800_01.pdf) |
| kf-768b1d149cd6 | 厂家原站 | read | [PRO160NS 技术表](https://asset.fujifilm.com/www/jp/files/2024-04/6b75b1c1cb4253623fb2cd7a56ff7443/datasheet_pro160ns_01.pdf) |
| kf-e2d61a74deba | 厂家原站 | read | [PRO160NH 技术表](https://asset.fujifilm.com/www/jp/files/2024-04/bae096c3cfae4c41066de30038ea6ddf/datasheet_pro160nh_01.pdf) |
| kf-9c77420badc3 | 厂家原站 | read | [PRO160NC 技术表](https://asset.fujifilm.com/www/jp/files/2024-04/580aa23b1083768640aa3885942918dc/datasheet_pro160nc_01.pdf) |
| kf-e545c06a1cb1 | 厂家原站 | read | [160NS 技术表](https://asset.fujifilm.com/www/jp/files/2024-04/cf720a8045c8ed1cb9f107a784ba2cc4/datasheet_160ns_01.pdf) |
| kf-0f6c4bd79629 | 厂家原站 | read | [160NL 技术表](https://asset.fujifilm.com/www/jp/files/2024-04/1e776698fb5204129be58bc97ad95239/datasheet_160nl_01.pdf) |
| kf-e7a3265f7ee9 | 厂家原站 | read | [160NC 技术表](https://asset.fujifilm.com/www/jp/files/2024-04/5ecc52450b40a774406d7f1546b29567/datasheet_160nc_01.pdf) |
| kf-71b5586cbb42 | 厂家原站 | read | [160NPC 技术表](https://asset.fujifilm.com/www/jp/files/2024-04/6cc43e223cf542ef0ecc6eed551459ee/datasheet_160npc_01.pdf) |
| kf-3fab10bded0c | 厂家原站 | read | [PRO400H 技术表](https://asset.fujifilm.com/www/jp/files/2024-04/198fe31ee57628013d29171770b28218/datasheet_pro400h_01.pdf) |
| kf-439f5239d362 | 厂家原站 | read | [New PRO400 技术表](https://asset.fujifilm.com/www/jp/files/2024-04/9aa1f2e4488cd7d13abefed690cf289c/datasheet_newpro400_01.pdf) |
| kf-f3475b685a3b | 厂家原站 | read | [PRO800 技术表](https://asset.fujifilm.com/www/jp/files/2019-12/9b41c4aaa31d1d293a858b0b0ffdd8e6/datasheet_pro800_01.pdf) |
| kf-54b49d5d0253 | 厂家原站 | read | [プロビア100F 技术表](https://asset.fujifilm.com/www/jp/files/2025-09/4fc51a5c0951d8692af25e0792e464de/datasheet_provia100f_01.pdf) |
| kf-2e292758eb05 | 厂家原站 | read | [プロビア400X 技术表](https://asset.fujifilm.com/www/jp/files/2024-04/cd34674ec5beb8ba062cd221a656bbd5/datasheet_provia400x_01.pdf) |
| kf-0bbf1ab5b89e | 厂家原站 | read | [プロビア400F 技术表](https://asset.fujifilm.com/www/jp/files/2024-04/13bf604980eadaeec94e72018d04a8d8/datasheet_provia400f_01.pdf) |
| kf-e5fdc03f7992 | 厂家原站 | read | [ベルビア50 技术表](https://asset.fujifilm.com/www/jp/files/2024-04/7d7888aab11c548b2acd50f0fee9e504/datasheet_velvia50_01.pdf) |
| kf-12cb7cba0d70 | 厂家原站 | read | [ベルビア 技术表](https://asset.fujifilm.com/www/jp/files/2024-04/f1d4dc94f56605cbc32151a1fa60e4f0/datasheet_velvia_01.pdf) |
| kf-f4fbd64fb5d8 | 厂家原站 | read | [ベルビア100 技术表](https://asset.fujifilm.com/www/jp/files/2024-04/56c15e414d446997d6d609f5726df093/datasheet_velvia100_01.pdf) |
| kf-113ec2ae29b7 | 厂家原站 | read | [ベルビア100F 技术表](https://asset.fujifilm.com/www/jp/files/2025-09/784ef03368f1ae3ccce8a092cb029fd7/datasheet_velvia100f_01.pdf) |
| kf-04832f444ac3 | 厂家原站 | read | [アスティア100F 技术表](https://asset.fujifilm.com/www/jp/files/2024-04/5aabd425a442d98c30e91ca1bd12f4b8/datasheet_astia100f_01.pdf) |
| kf-c9d709d90823 | 厂家原站 | read | [センシアIII100 技术表](https://asset.fujifilm.com/www/jp/files/2024-04/78ba80660bc6e6af978b56efe045915a/datasheet_sensiaiii100_01.pdf) |
| kf-e19692c903b4 | 厂家原站 | read | [トレビ100C 技术表](https://asset.fujifilm.com/www/jp/files/2024-04/ae5aef947b043303bc18c218d7947f22/datasheet_trebi100c_01.pdf) |
| kf-89b9613d3f4e | 厂家原站 | read | [トレビ400 技术表](https://asset.fujifilm.com/www/jp/files/2024-04/723037fb14c03cfc40bf55ac9719c8cd/datasheet_trebi400_01.pdf) |
| kf-e5ee34b122e5 | 厂家原站 | read | [T64 技术表](https://asset.fujifilm.com/www/jp/files/2024-04/084449505a12147f2cce415fdfa87b96/datasheet_t64_01.pdf) |
| kf-5b393f21304b | 厂家原站 | read | [64T タイプII 技术表](https://asset.fujifilm.com/www/jp/files/2024-04/8ee965d020b20e9088cb012a67c77d0c/datasheet_64ttypeii_01.pdf) |
| kf-6e27684bd749 | 厂家原站 | read | [100ix 技术表](https://asset.fujifilm.com/www/jp/files/2024-04/2e58b551f440f4476e26fd8e4b4894be/datasheet_100ix_01.pdf) |
| kf-044723c2838e | 厂家原站 | read | [ネオパン 100 ACROS Ⅱ（135） 技术表](https://asset.fujifilm.com/www/jp/files/2024-04/d217f807f3b5a56e8a8c6f74f7e3dede/datasheet_neopan100acros2_135_01.pdf) |
| kf-11a941e9805f | 厂家原站 | read | [ネオパン 100 ACROS Ⅱ（120） 技术表](https://asset.fujifilm.com/www/jp/files/2024-04/91c9aca91605666e5b8b749b928a94fb/datasheet_neopan100acros2_120_01.pdf) |
| kf-dd78b87ffd8e | 厂家原站 | read | [ネオパン 400 PRESTO（135） 技术表](https://asset.fujifilm.com/www/jp/files/2019-12/34aac580ca2ba80532d72269e84aa9ce/datasheet_neopan400presto135_01.pdf) |
| kf-21a0a73891ea | 厂家原站 | read | [ネオパン 400 PRESTO（120） 技术表](https://asset.fujifilm.com/www/jp/files/2019-12/a9c8f2ff6b7bbf06b060018416cef995/datasheet_neopan400presto120_01.pdf) |
| kf-1741d20954b4 | 厂家原站 | read | [ネオパン 1600 Super PRESTO（日本語） 技术表](https://asset.fujifilm.com/www/jp/files/2019-12/87d7cd58b53d2e819e1119a43f110970/datasheet_neopan1600superpresto_jp_01.pdf) |
| kf-78f1ab24d4c4 | 厂家原站 | read | [ネオパン 1600 Super PRESTO（英語） 技术表](https://asset.fujifilm.com/www/jp/files/2019-12/a80cda9888a206303c836f7ffd99709b/datasheet_neopan1600superpresto_en_01.pdf) |
| kf-dd68caed97cd | 厂家原站 | read | [ネオパン SS（日本語） 技术表](https://asset.fujifilm.com/www/jp/files/2019-12/5ac230b07c70ae2d47d8a68bf4801ed9/datasheet_neopanss_jp_01.pdf) |
| kf-802882af4534 | 厂家原站 | read | [ネオパン SS（英語） 技术表](https://asset.fujifilm.com/www/jp/files/2019-12/5cff4aeedafee45ce703f57552de76e6/datasheet_neopanss_en_01.pdf) |
| kf-f8b075d4454f | 厂家原站 | read | [ネオパンオルソ（シート） 技术表](https://asset.fujifilm.com/www/jp/files/2019-12/719e74fb2058f3fad8c901af33d5cbcb/datasheet_neopanortho_01.pdf) |
| kf-4ae394c2915a | 厂家原站 | read | [ミニコピーフィルムHRII（シート） 技术表](https://asset.fujifilm.com/www/jp/files/2019-12/06c270fb14707f323716dfe488e3d06d/datasheet_minicopyfilmhrii_01.pdf) |
| kf-2f0e4c3e7bc3 | 厂家原站 | read | [Kodak Gold 200 技术表](https://kodakprofessional.com/sites/default/files/wysiwyg/E7022-1.pdf) |
| kf-dfd428b67d77 | 厂家原站 | read | [Kodak Portra 160 技术表](https://www.kodakprofessional.com/sites/default/files/2025-07/e4051.pdf) |
| kf-e85d1b7bfd18 | 厂家原站 | read | [Kodak Portra 400 技术表](https://www.kodakprofessional.com/sites/default/files/2025-07/e4050.pdf) |
| kf-0fa385448910 | 厂家原站 | read | [Kodak Ektar 100 技术表](https://www.kodakprofessional.com/sites/default/files/2025-07/e4046.pdf) |
| kf-088e82382782 | 厂家原站 | read | [Fujifilm C200 技术表](https://asset.fujifilm.com/www/us/files/2025-06/79a1ad75d6ce087912eb7f63bfebb1f1/films_c200_datasheet_01.pdf) |
| kf-17dc15853985 | 厂家原站 | read | [Fujifilm Superia X-tra 400 技术表](https://asset.fujifilm.com/www/us/files/2025-06/8abba3dd9d004f44d1e9c7fdbdf5c520/films_superia-xtra400_datasheet_01.pdf) |
| kf-98bda55967ff | 厂家原站 | read | [Kodak Portra 800 技术表](https://www.kodakprofessional.com/sites/default/files/2025-07/e4040.pdf) |
| kf-354b69279122 | 厂家原站 | read | [Kodak Ultra Max 400 技术表](https://www.kodakprofessional.com/sites/default/files/wysiwyg/pro/resources/E7023_max_400.pdf) |
| kf-dc0da97c3f7f | 厂家原站 | read | [Kodak T-MAX 100 技术表](https://www.kodakprofessional.com/sites/default/files/wysiwyg/pro/resources/f4016_TMax_100.pdf) |
| kf-b45cca64ea6b | 厂家原站 | read | [Kodak T-MAX 400 技术表](https://www.kodakprofessional.com/sites/default/files/wysiwyg/pro/resources/f4043_TMax_400.pdf) |
| kf-f0de0cebac3c | 厂家原站 | read | [Kodak Tri-X 400 技术表](https://www.kodakprofessional.com/sites/default/files/wysiwyg/pro/resources/f4017_TriX.pdf) |
| kf-0552b6e09d4d | 厂家原站 | read | [Kodak Ektachrome E100 技术表](https://kodakprofessional.com/sites/default/files/wysiwyg/pro/resources/e4000_ektachrome_100.pdf) |
| kf-78cea5f2bade | 厂家原站 | read | [Kodak KODACOLOR 200 产品页](https://www.kodak.com/en/still-film/product/consumer/kodacolor-film/) |
| kf-84b554c1ee2f | 厂家原站 | read | [Kodak EKTACOLOR PRO 160 产品页](https://www.kodak.com/en/still-film/product/professional/ektacolor/ektacolor-pro-160-film/) |
| kf-447b262d3504 | 厂家原站 | read | [Kodak EKTACOLOR PRO 400 产品页](https://www.kodak.com/en/still-film/products/professional/) |
| kf-59a6004e2856 | 厂家原站 | read | [Kodak EKTACOLOR PRO 800 产品页](https://www.kodak.com/en/still-film/product/professional/ektacolor/ektacolor-pro-800-film/) |
| kf-530328566765 | 厂家原站 | read | [Kodak EKTAPAN 100 产品页](https://www.kodak.com/en/still-film/product/professional/ektapan/ektapan-100-film/) |
| kf-82c2b0ce6c98 | 厂家原站 | read | [Kodak EKTAPAN 400 产品页](https://www.kodak.com/en/still-film/product/professional/ektapan/ektapan-400-film/) |
| kf-8426878bfbcc | 厂家原站 | read | [Kodak EKTAPAN P3200 产品页](https://www.kodak.com/en/still-film/product/professional/ektapan/ektapan-p3200-film/) |
| kf-4afbfac54ecf | 厂家原站 | read | [Kodak AEROCOLOR IV 2460 技术表](https://www.kodak.com/content/products-brochures/Advanced-Materials/KODAK-AEROCOLOR-III-Negative-Film-2460-datasheet.pdf) |
| kf-ef0645e87ca4 | 厂家原站 | search-snippet | [FUJIFILM 200 产品页](https://www.fujifilm.com/us/en/consumer/films/consumer-film/fujifilm-200) |
| kf-54e2229542ae | 厂家原站 | read | [FUJIFILM Professional Data Guide ©2005](https://asset.fujifilm.com/www/ca/files/2020-03/d52487c5c6f84e7f935c299491c5c1ff/ProfessionalFilmDataGuide.pdf) |
| kf-058e3123bb76 | 社区 | read | [炮塔160玩家称呼与Noritsu样片](https://www.letsfilm.net/archives/552055) |
| kf-cea92a598bf3 | 社区 | read | [Kodak/Lomo身份与对照测试讨论](https://www.photrio.com/forum/threads/what-exactly-are-the-kodak-made-lomo-stocks.204506/) |
| kf-91b01e38c567 | 社区 | read | [ECN-2控制条与HS1800讨论](https://www.photrio.com/forum/threads/ecn2-test-strips.211627/) |
| kf-f5fa7a25ce54 | 社区 | read | [新版FUJIFILM200与旧C200技术表讨论](https://www.photrio.com/forum/threads/new-fujifilm-fujicolor-200.188982/) |
| kf-c602fbd28ba0 | 社区 | read | [不同地区Superia版本讨论](https://www.photrio.com/forum/threads/different-fujifilm-superia-emulsions.115777/) |
| kf-171aee8ad2b6 | 社区 | search-snippet | [Venus800与X-TRA800比较](https://www.photrio.com/forum/threads/superia-venus-800-superia-x-tra-800.142855/) |
| kf-c3606afb03ce | 厂家原著镜像 | read | [Kodak Pro Image100 E-4L 1997-07](https://dreamartemis.wordpress.com/wp-content/uploads/2014/01/kodak-proimage-100.pdf) |
| kf-cdb47b023048 | 社区 | search-snippet | [ProImage100专业人像卷玩家商品记录](https://wiki.smzdm.com/p/70mdg01/) |
| kf-7a18d7c4d3fd | 厂家原站 | read | [Kodak厂家资源与产品目录](https://www.kodakprofessional.com/photographers/resources) |
| bw-ilford-index | 厂家原站 | read | [ILFORD 官方技术资料索引](https://www.ilfordphoto.com/technical-data/) |
| bw-ilford-hp5-plus | 厂家原站 | read | [HP5 PLUS 技术资料](https://www.ilfordphoto.com/amfile/file/download/file/1903/product/695/) |
| bw-ilford-fp4-plus | 厂家原站 | read | [FP4 PLUS 技术资料](https://www.ilfordphoto.com/amfile/file/download/file/1919/product/690/) |
| bw-ilford-pan-f-plus | 厂家原站 | read | [PAN F PLUS 技术资料](https://www.ilfordphoto.com/amfile/file/download/file/1905/product/700/) |
| bw-ilford-delta-100 | 厂家原站 | read | [DELTA 100 PROFESSIONAL 技术资料](https://www.ilfordphoto.com/amfile/file/download/file/3/product/681/) |
| bw-ilford-delta-400 | 厂家原站 | unavailable | DELTA 400 PROFESSIONAL 技术资料（不可访问或域名已漂移，原地址仅保留在JSON） |
| bw-ilford-delta-3200 | 厂家原站 | read | [DELTA 3200 PROFESSIONAL 技术资料](https://www.ilfordphoto.com/wp/wp-content/uploads/2025/07/DP3200_F25.pdf) |
| bw-ilford-xp2-super | 厂家原站 | read | [XP2 SUPER 技术资料](https://www.ilfordphoto.com/amfile/file/download/file/1909/product/704/) |
| bw-ilford-sfx-200 | 厂家原站 | read | [SFX 200 技术资料](https://www.ilfordphoto.com/amfile/file/download/file/1907/product/702/) |
| bw-ilford-ortho-plus | 厂家原站 | read | [ORTHO PLUS 技术资料](https://www.ilfordphoto.com/amfile/file/download/file/1948/product/698/) |
| bw-kentmere-pan-100 | 厂家原站 | read | [PAN 100 技术资料](https://www.ilfordphoto.com/wp/wp-content/uploads/2022/12/KENTMERE-PAN-100_04_07_22.pdf) |
| bw-kentmere-pan-200 | 厂家原站 | read | [PAN 200 技术资料](https://www.ilfordphoto.com/wp/wp-content/uploads/2025/05/KENTMERE-PAN-200-260325.pdf) |
| bw-kentmere-pan-400 | 厂家原站 | read | [PAN 400 技术资料](https://www.ilfordphoto.com/wp/wp-content/uploads/2022/12/KENTMERE-PAN-400_04_07_22.pdf) |
| bw-ilfosol3 | 厂家原站 | read | [ILFORD ILFOSOL3 技术表（2024-09）](https://www.ilfordphoto.com/amfile/file/download/file/572/product/542/) |
| bw-rollei-index | 厂家原站 | read | [Rollei/Maco 官方下载](https://www.rolleianalog.com/downloads/?lang=en) |
| bw-rollei-rpx-25 | 厂家原站 | read | [RPX 25 技术表 R210701](https://www.rolleianalog.com/wp-content/uploads/2021/07/RPX25_Data-Sheet_EN_R210701.pdf) |
| bw-rollei-rpx-100 | 厂家原站 | read | [RPX 100 技术表 R210701](https://www.rolleianalog.com/wp-content/uploads/2021/07/RPX100_Data-Sheet_EN_R210701.pdf) |
| bw-rollei-rpx-400 | 厂家原站 | read | [RPX 400 技术表 R210701](https://www.rolleianalog.com/wp-content/uploads/2021/07/RPX400_Data-Sheet_EN_R210701.pdf) |
| bw-rollei-retro-80s | 厂家原站 | read | [RETRO 80S 技术表 R210701](https://www.rolleianalog.com/wp-content/uploads/2021/07/Retro80S_Data-Sheet_EN_R210701.pdf) |
| bw-rollei-retro-400s | 厂家原站 | read | [RETRO 400S 技术表 R210701](https://www.rolleianalog.com/wp-content/uploads/2021/07/Retro400S_Data-Sheet_EN_R210701.pdf) |
| bw-rollei-superpan-200 | 厂家原站 | read | [SUPERPAN 200 技术表 R210701](https://www.rolleianalog.com/wp-content/uploads/2021/07/SUPERPAN200_Data-Sheet_EN_R210701.pdf) |
| bw-rollei-infrared | 厂家原站 | read | [INFRARED 技术表 R210701](https://www.rolleianalog.com/wp-content/uploads/2021/07/INFRARED_Data-Sheet_EN_R210701.pdf) |
| bw-rollei-ortho-25-plus | 厂家原站 | read | [ORTHO 25 plus 技术表 R210701](https://www.rolleianalog.com/wp-content/uploads/2021/07/Ortho25_Data-Sheet_EN_R210701.pdf) |
| bw-adox-index | 厂家原站 | read | [ADOX 官方胶片目录](https://www.adox.de/en/) |
| bw-adox-chs-100-ii | 厂家原站 | read | [CHS 100 II 官方说明](https://www.adox.de/films/chs100ii-en/) |
| bw-adox-hr-50 | 厂家原站 | read | [HR-50 官方说明](https://www.adox.de/hr50-en/) |
| bw-adox-cms-20-ii | 厂家原站 | read | [CMS 20 II 官方说明](https://www.adox.de/films/cms20ii-en/) |
| bw-adox-scala-50 | 厂家原站 | read | [SCALA 50 官方说明](https://www.adox.de/scala50-en/) |
| bw-adox-scala-160 | 厂家原站 | read | [SCALA 160 官方说明](https://www.adox.de/scala160-en/) |
| bw-adox-pan-x-reverso-super8 | 厂家原站 | read | [PAN-X REVERSO SUPER 8 官方说明](https://www.adox.de/films/pan-x-reverso-super8-en/) |
| bw-adox-discontinued | 厂家原站 | read | [ADOX 官方停产清单](https://www.adox.de/discontinued-products/) |
| bw-adox-silvermax | 厂家原站 | read | [ADOX Silvermax 历史官方页](https://www.adox.de/films/adox-silvermax/) |
| bw-foma-list | 厂家原站 | read | [Foma 官方黑白胶片清单](https://www.foma.cz/produkty-cernobile-filmy-22) |
| bw-foma-catalog | 厂家原站 | read | [Foma 官方产品与显影手册](https://www.foma.cz/en/catalogue_bw_photo_materials_and_developing_information) |
| bw-foma-100-classic | 厂家原站 | read | [FOMAPAN 100 Classic 官方技术表](https://www.foma.cz/cs/fomapan-100) |
| bw-foma-200-creative | 厂家原站 | read | [FOMAPAN 200 Creative 官方技术表](https://www.foma.cz/cs/fomapan-200) |
| bw-foma-400-action | 厂家原站 | read | [FOMAPAN 400 Action 官方技术表](https://www.foma.cz/cs/fomapan-400) |
| bw-foma-retropan-320 | 厂家原站 | read | [RETROPAN 320 soft 官方技术表](https://www.foma.cz/cs/retropan320) |
| bw-foma-ortho-400 | 厂家原站 | read | [FOMA Ortho 400 官方技术表](https://www.foma.cz/en/fomaortho) |
| bw-foma-r-100 | 厂家原站 | read | [FOMAPAN R 100 官方技术表](https://www.foma.cz/cs/fomapan-R-100) |
| bw-bergger-pancro400 | 厂家原站 | read | [Bergger Pancro400 官方技术表](https://bergger.com/en/index.php?controller=attachment&id_attachment=4) |
| bw-shanghai-list | 厂家原站 | read | [Shanghai GP3/Jiancheng 官方目录](https://www.shjcfilm.com/) |
| bw-shanghai-gp3-100 | 厂家原站 | read | [GP3 100 官方产品页](https://www.shjcfilm.com/gp3-100-120) |
| bw-shanghai-gp3-400 | 厂家原站 | read | [GP3 400 官方产品页](https://www.shjcfilm.com/gp3-400-120) |
| bw-lucky-store | 厂家原站 | search-snippet | [乐凯影像商城SHD条目](https://www.lucky.cn/index/home) |
| bw-ferrania-p30 | 厂家原站 | read | [FERRANIA P30 官方使用指引（2020-02-20）](https://www.filmferrania.com/p30-info) |
| bw-ferrania-pmk-forum | 社区 | read | [Photrio：Ferrania P30/P33/Orto + PMK 显影讨论](https://www.photrio.com/forum/threads/ferrania-p30-p33-orto-pmk-dev-times.219044/) |
| bw-catlabs-index | 厂家原站 | read | [CatLABS 自有胶片目录](https://www.catlabs.info/category/film) |
| bw-catlabs-x-pan-320-pro | 厂家原站 | read | [X Pan 320 Pro 品牌页](https://www.catlabs.info/product/xpan320) |
| bw-catlabs-x-film-80-mkii | 厂家原站 | read | [X FILM 80 MKII 品牌页](https://www.catlabs.info/product/clxf80ii) |
| bw-catlabs-x-film-320-pro | 厂家原站 | read | [X FILM 320 Pro 品牌页](https://www.catlabs.info/product/catlabs-x-film-320) |
| bw-leica-monopan50 | 厂家原站 | read | [Leica MONOPAN50 官方规格](https://leica-camera.com/en-int/photography/accessories/m/film/monopan-50/technical-specification) |
| bw-washi-120 | 厂家原站 | read | [Film Washi 官方120产品目录](https://filmwashi.com/en/products/120_films/) |
| bw-washi-135 | 厂家原站 | read | [Film Washi 官方135产品目录](https://filmwashi.com/en/products/135_films/) |
| bw-community-retro80s | 社区 | read | [Photrio：The Taming of the Retro80S](https://www.photrio.com/forum/threads/the-taming-of-the-retro-80s.86094/) |
| bw-community-foma400 | 社区 | read | [Photrio：Arista EDU Ultra400 push/pull](https://www.photrio.com/forum/threads/arista-edu-ultra-400-push-pull-ability.178489/) |
| bw-community-gp3 | 社区 | read | [Photrio：GP3 100 220使用反馈](https://www.photrio.com/forum/threads/shanghai-gp3-100-220-still-an-unfinished-product.188935/page-15) |
| bw-community-microfilm | 社区 | read | [Photrio：CMS20/HR50微缩片讨论](https://www.photrio.com/forum/threads/microfilms-or-will-there-ever-be-a-new-cms20.206627/page-3) |
| bw-leica-monopan50-cn-pdf | 厂家原站 | read | [Leica MONOPAN50 中文官方技术表（2025-06）](https://leica-camera.com/sites/default/files/pm-122805-Leica-Monopan50_Technical-Data_cn.pdf) |
| bw-ferrania-p33-mirror | 厂家原著镜像 | read | [FERRANIA P33 Best Practices 厂家编制资料（Maco镜像）](https://www.macodirect.de/media/pdf/45/5b/2d/FP3311_Datenblatt_d.pdf) |
| bw-agfaphoto-listed | 厂家原站 | read | [AgfaPhoto 官方模拟摄影产品](https://agfaphoto.com/en/analog-photography-single-use-cameras/) |
| alt_harman_200 | 厂家原站 | read | [HARMAN Phoenix 200 Technical Information，Sep2024](https://www.harmanphoto.co.uk/amfile/file/download/file/1963/product/2143/) |
| alt_harman_scan | 厂家原站 | read | [HARMAN Phoenix 200 Recommended Scanning Parameters，Oct2024](https://www.harmanphoto.co.uk/wp/wp-content/uploads/sites/3/2024/10/Phoenix-Scanning-Parameters-011024.pdf) |
| alt_harman_ii | 厂家原站 | read | [HARMAN Phoenix II Technical Information，Jul2025](https://www.harmanphoto.co.uk/amfile/file/download/file/1968/product/2208/) |
| alt_harman_products | 厂家原站 | read | [HARMAN现行彩色产品目录](https://www.harmanphoto.co.uk/products/harman-colour-film) |
| alt_harman125 | 厂家原站 | read | [HARMAN Phoenix125官方产品页](https://www.harmanphoto.co.uk/harman-phoenix-125-35mm) |
| alt_harman125pdf | 厂家原站 | unavailable | HARMAN Phoenix125 TDS H26下载入口（不可访问或域名已漂移，原地址仅保留在JSON） |
| alt_azure | 厂家原站 | read | [HARMAN Switch Azure技术表 B26](https://www.harmanphoto.co.uk/amfile/file/download/file/1969/product/2229/) |
| alt_red | 厂家原站 | read | [HARMAN Red125官方产品页](https://www.harmanphoto.co.uk/harman-red-125-35mm) |
| alt_harman_tips | 厂家原站 | read | [HARMAN Scanning Tips](https://www.harmanphoto.co.uk/scanning-tips/) |
| alt_cine_catalog | 品牌原站 | read | [CineStill现行产品目录](https://cinestillfilm.com/collections) |
| alt_cinefaq | 品牌原站 | read | [CineStill FAQ](https://cinestillfilm.com/pages/frequently-asked-questions) |
| alt_cine_daylight | 品牌原站 | search-snippet | [CineStill 800T daylight过滤建议](https://help.cinestillfilm.com/hc/en-us/articles/360029186431-Should-I-use-a-filter-on-800Tungsten-in-daylight) |
| alt_lomo_guide | 品牌原站 | read | [Lomography Films and Formats品牌指南](https://www.lomography.com/magazine/327296-a-guide-to-lomography-films-and-formats) |
| alt_lomo400pdf | 品牌原站 | read | [Lomography CN400 Film Guide](https://cdn.downloads.lomography.com/downloads/color-negative-400-film-guide.pdf) |
| alt_lomo_current | 品牌原站 | read | [Lomography What are LomoChrome films?，2026-08-26更新](https://www.lomography.com/school/what-are-lomochrome-films-fa-g3ebpber) |
| alt_lomo_archive_names | 品牌原站 | search-snippet | [Lomography胶卷图库名录](https://www.lomography.com/films) |
| alt_adox_implosion | 厂家原站 | read | [ADOX Color Implosion EOL原厂页](https://www.adox.de/adox-color-implosion-2/) |
| alt_orwo | 厂家原站 | read | [ORWO Family产品/创新页](https://orwo.family/) |
| alt_agfa98 | 厂家原著镜像 | read | [AGFA Professional range technical data 09/1998厂家原著镜像](https://125px.com/docs/film/agfa/agfa_films.pdf) |
| alt_agfa03 | 厂家原著镜像 | read | [Agfa Professional Films F-PF-E4厂家原著镜像](https://125px.com/docs/film/agfa/Datasheet_F_PF_E4.pdf) |
| alt_agfa_consumer | 厂家原著镜像 | search-snippet | [AGFA消费胶片技术表原著镜像检索](https://www.yumpu.com/en/document/view/22040653/films-technical-data-gomma) |
| alt_konica2001 | 厂家原著镜像 | read | [Konica Technical Report14，New Centuria，2001](https://research.konicaminolta.com/jp/pdf/technology_report/2001/pdf/02.pdf) |
| alt_konica_price | 厂家原著镜像 | search-snippet | [KonicaMinolta历史产品价格表官网检索](https://www.konicaminoltasupport.com/fileadmin/camera_minolta/pricelist/German/g_pricelist_complete_dh.pdf) |
| alt_ferraniaforum | 社区 | read | [Photrio Hello APUG from FILM Ferrania PART2 p32](https://www.photrio.com/forum/threads/hello-apug-from-film-ferrania-part-2.128272/page-32) |
| alt_luckyforum | 社区 | read | [Reddit Lucky C200 Review](https://www.reddit.com/r/AnalogCommunity/comments/1qjnf66/lucky_c200_review/) |
| alt_phoenixforum | 社区 | read | [Reddit Was not impressed with Harman Phoenix](https://www.reddit.com/r/AnalogCommunity/comments/1jlx59g/wasnt_impressed_with_harman_phoenix/) |
| alt_cineforum | 社区 | search-snippet | [Photrio CineStill800T Film Review](https://www.photrio.com/forum/threads/cinestill-800t-film-review-images-please.220619/) |
| alt_lomo_forum | 社区 | search-snippet | [Reddit LomoChrome Color92 sample discussion](https://www.reddit.com/r/analog/comments/15xwxgo/loving_the_new_lomochrome_color_92_nikon_f_nikkor/) |
| alt_lucky_shop | 品牌原站 | search-snippet | [乐凯影像商城](https://www.lucky.cn/) |
| alt_lomo_lobster_history | 品牌原站 | read | [Lomopedia Lobster Redscale110品牌历史页，2013-07-19](https://www.lomography.com/magazine/246562-lomopedia-lomography-lobster-redscale-100-iso-110-film) |
| motion-kodak-camera | 厂家原站 | read | [Kodak 当前摄影机胶片目录](https://www.kodak.com/en/motion/products/camera-films/) |
| motion-kodak-history | 厂家原站 | read | [Kodak Chronology of Film](https://www.kodak.com/en/motion/page/chronology-of-film/) |
| motion-kodak-5203-2026 | 厂家原站 | read | [Kodak VISION3 50D H-1-5203，2026-03](https://www.kodak.com/content/products-brochures/motion-picture/KODAK-VISION3-50D-5203-7203-technical-information.pdf) |
| motion-kodak-5207-2026 | 厂家原站 | read | [Kodak VISION3 250D H-1-5207，2026-03](https://www.kodak.com/content/products-brochures/motion-picture/KODAK-VISION3-250D-5207-7207-technical-information.pdf) |
| motion-kodak-5213-2026 | 厂家原站 | read | [Kodak VISION3 200T H-1-5213，2026-03](https://www.kodak.com/content/products-brochures/motion-picture/KODAK-VISION3-200T-5213-7213-technical-information.pdf) |
| motion-kodak-5219-2026 | 厂家原站 | read | [Kodak VISION3 500T H-1-5219，2026-03](https://www.kodak.com/content/products-brochures/motion-picture/KODAK-VISION3-5219-7219-technical-information.pdf) |
| motion-kodak-5222 | 厂家原站 | read | [Kodak DOUBLE-X H-1-5222，2022-03](https://www.kodak.com/content/products-brochures/Film/DOUBLEX-Technical-Data-EN.pdf) |
| motion-kodak-7266 | 厂家原站 | read | [Kodak TRI-X H-1-7266，2026-03](https://www.kodak.com/content/products-brochures/motion-picture/KODAK-TRI-X-7266-technical-information.pdf) |
| motion-kodak-verita | 厂家原站 | read | [Kodak VERITA 200D 5206/7206 官网产品页](https://www.kodak.com/en/motion/product/camera-films/verita-200d-5206-7206/) |
| motion-kodak-post | 厂家原站 | read | [Kodak Post Production 当前目录](https://www.kodak.com/en/motion/products/post/) |
| motion-kodak-2383 | 厂家原站 | read | [Kodak VISION Color Print 2383/3383 产品页](https://www.kodak.com/en/motion/product/post/print-films/vision-color-2383-3383/) |
| motion-fuji-manual-mirror | 厂家原著镜像 | read | [FUJIFILM Motion Picture Film Manual（厂家原著，第三方历史镜像）](https://vfxcamdb.com/wp-content/uploads/2015/06/fujifilm_motion_picture_film_manual.pdf) |
| motion-fuji-vivid160-mirror | 厂家原著镜像 | read | [FUJIFILM ETERNA Vivid160 KB-0701E（2007厂家原著镜像）](https://cinematography.net/Files-2/vivid160.pdf) |
| motion-fuji-eterna-rdi-paper | 厂家原著镜像 | read | [FUJIFILM R&D No.53 2008 ETERNA-RDI 论文](https://asset.fujifilm.com/www/jp/files/2019-12/086cdc8636ea5ed63f24d1d3fc3df626/ff_rd053_001_en.pdf) |
| motion-fuji-rds | 厂家原站 | read | [FUJIFILM ETERNA-RDS 4791 原站产品页](https://www.fujifilm.com/us/en/business/professional-photography/motion-picture-archive-film-product) |
| motion-fuji-old-discontinuation-url | 厂家原著镜像 | unavailable | 富士2013停产公告原链接（已漂移）（不可访问或域名已漂移，原地址仅保留在JSON） |
| motion-community-fuji-discontinuation | 社区 | read | [DVXuser 2013 富士停产公告转载讨论](https://www.dvxuser.com/threads/fujifilm-officially-discontinues-production-of-motion-picture-film.308889/) |
| motion-orwo-technical | 厂家原站 | read | [ORWO/FilmoTec Technical Information](https://orwo.shop/pages/technical-information) |
| motion-orwo-un54 | 厂家原站 | search-snippet | [ORWO UN54 35mm 产品页](https://orwo.shop/products/orwo-un54-35mm) |
| motion-orwo-nc500 | 厂家原站 | search-snippet | [ORWO 35mm NC500 Colour Cine 产品页](https://orwo.shop/products/orwo-nc500-colour-cine-35mm) |
| motion-community-ecn-c41 | 社区 | read | [Photrio Another Kodak Vision3 remjet film thread](https://www.photrio.com/forum/threads/another-kodak-vision3-remjet-film-thread.193801/page-3) |
| motion-community-sidebyside | 社区 | search-snippet | [Reddit Comparing Vision3 250D AHU in C-41 and ECN-2](https://www.reddit.com/r/AnalogCommunity/comments/1oegqyz) |
| motion-community-doublex | 社区 | read | [Photrio Cinestill Double-X film: how important to use D-96?](https://www.photrio.com/forum/threads/cinestill-double-x-film-how-important-to-use-d-96.186402/) |
| motion-community-print-lut | 社区 | read | [CML 2K 4:4:4 Spec Check 讨论](https://www.cinematography.net/edited-pages/2k_444_SpecCheck.htm) |
| motion-kodak-e100d-2026 | 厂家原站 | read | [Kodak EKTACHROME 100D H-1-5294，2026-03](https://www.kodak.com/content/products-brochures/motion-picture/KODAK-EKTACHROME-100D-5294-7294-technical-information.pdf) |
| motion-kodak-verita-brochure | 厂家原站 | read | [Kodak VERITA 200D 5206/7206 brochure](https://www.kodak.com/content/pdfs/motion/KODAK-VERITA-200D-5206-7206-brochure.pdf) |
| motion-filmotec-n75 | 厂家原站 | read | [FilmoTec N75 Technical Information](https://filmotec.de/wp-content/uploads/2022/07/Technische-Info-N75.pdf) |
| motion-community-n75 | 社区 | read | [Photrio ORWO N75讨论](https://www.photrio.com/forum/threads/orwo-n75.179218/) |
| add-reflx-135 | 品牌原站 | read | [Reflx Lab 135 Film 品牌目录](https://reflxlab.com/en-de/collections/135-film) |
| add-reflx-320 | 品牌原站 | read | [Reflx Lab 320D AHU 产品页](https://reflxlab.com/en-de/products/reflx-lab-320d-ahu-color-film-36exp) |
| add-reflx-640 | 品牌原站 | read | [Reflx Lab 640T AHU 产品页](https://reflxlab.com/en-de/products/1-roll-reflx-lab-320d-ahu-color-film-36exp) |
| add-reflx-diablo | 品牌原站 | read | [Reflx Lab Diablo100 产品页](https://reflxlab.com/en-de/products/reflx-lab-diablo-100-red-scale-film) |
| add-fnd-bulk | 品牌原站 | read | [FilmNeverDie 品牌批发目录](https://filmneverdie.com/pages/bulk-fnd-films-buy) |
| add-fnd-bento | 品牌原站 | read | [FilmNeverDie 2026 Bento品牌组合说明](https://filmneverdie.com/products/filmneverdie-bento-box) |
| add-fnd-bulkfilm | 品牌原站 | read | [FilmNeverDie bulk-film目录](https://filmneverdie.com/collections/bulk-film) |
| add-fnd-iro200 | 品牌原站 | read | [FilmNeverDie IRO200 2017品牌FAQ](https://filmneverdie.com/blogs/news/filmneverdie-iro-200-pre-orders-faq) |
| add-fnd-iro400 | 品牌原站 | read | [FilmNeverDie IRO400品牌产品页](https://filmneverdie.com/products/filmneverdie-iro-400-35mm-36-exp) |
| add-fnd-umi800 | 品牌原站 | read | [FilmNeverDie UMI800品牌产品页](https://filmneverdie.com/products/filmneverdie-umi-800-35mm-36-exp) |
| add-rera-list | 品牌原站 | read | [RERA 品牌经营方かわうそ商店目录](https://kawauso.biz/products/list?category_id=114) |
| add-rera-400 | 品牌原站 | read | [RERAPAN400 品牌经营方产品页](https://kawauso.biz/products/detail/1223) |
| add-rera-chrome100 | 品牌原站 | read | [RERACHROME100 原品牌经营方产品页](https://kawauso.biz/products/detail/1034) |
| add-tasma-index | 厂家原站 | read | [Tasma 原站摄影/特种胶片产品目录](https://tasma.ru/products/fotoplenki-i-plenki-spetsialnogo-naznacheniya/) |
| add-street-old-url | 品牌原站 | unavailable | StreetCandy历史品牌网站访问（不可访问或域名已漂移，原地址仅保留在JSON） |
| add-street-atm400 | 厂家原著镜像 | read | [Street Candy ATM400品牌技术表第三方镜像](https://parallaxphotographic.coop/wp-content/uploads/2018/09/Street-Candy-ATM-400-Data-Sheet.pdf) |
| add-street-mtn100 | 厂家原著镜像 | read | [Street Candy MTN100品牌技术表第三方镜像](https://analogfilm.space/assets/street-candy-mtn-100.dpdsqUzg.pdf) |
| add-jch-launch | 品牌原站 | read | [JCH StreetPan400 2016品牌发布页](https://www.japancamerahunter.com/2016/03/film-news-announcing-jch-streetpan-400-film/) |
| add-community-jch-curve | 社区 | read | [Adrian Bacon：JCH Streetpan400 H+D Curve，2020-04-30](https://www.photrio.com/forum/threads/jch-streetpan-400-h-d-curve-with-replenished-xtol-for-17-30-at-24c-in-a-jobo.174875/) |
| add-flic-site | 品牌原站 | unavailable | Flic Film 品牌cine-film入口（不可访问或域名已漂移，原地址仅保留在JSON） |
| add-community-elektra | 社区 | read | [Photrio Elektra100的C41反转实验](https://www.photrio.com/forum/threads/i-tried-aerocolor-c-41-reversal-very-odd-results.213108/) |
| add-astrum-site | 厂家原站 | unavailable | Astrum原站历史产品入口（不可访问或域名已漂移，原地址仅保留在JSON） |
| add-community-astrum | 社区 | read | [Photrio Astrum Summer2026 groupbuy](https://www.photrio.com/forum/threads/astrum-summer-2026-group-buy.220620/) |
| add-silberra-domain | 品牌原站 | unavailable | Silberra旧官网域名取证（不可访问或域名已漂移，原地址仅保留在JSON） |
| add-silberra-campaign | 品牌原站 | search-snippet | [Silberra品牌创办人历史众筹页面](https://www.indiegogo.com/en/projects/konstantinshabanov/silberra-b-w-photographic-films) |
| add-community-nir | 社区 | read | [Photrio NIR胶片列表/测试讨论](https://www.photrio.com/forum/threads/list-of-infrared-nir-films.203916/) |
| add-community-127 | 社区 | read | [Photrio 127film/RERAPAN400讨论](https://www.photrio.com/forum/threads/127-film.209442/) |
