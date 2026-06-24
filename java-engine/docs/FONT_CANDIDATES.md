# 字体候选清单（FONT_CANDIDATES）

本文件记录 camera-border-app 预览/渲染中用于「边框文字」的可信开源/免费商用字体候选。
仅做候选清单与接入建议，本轮不下载任何字体文件。

> 说明：所有判断基于各项目官方仓库或原作者页面的授权声明。第三方下载站的描述不作为依据。
> 若官方授权无法核验，一律标记为「暂不接入」，不硬塞。

---

## 通用接入约定（基于 OFL）

凡采用 SIL Open Font License 1.1（OFL）的字体：

- 允许商业使用，无需付费、无需告知作者。
- 允许随 App 打包再分发（可一并销售），但**禁止单独出售字体文件本身**。
- 随包分发时，**必须同时纳入对应的 LICENSE / OFL.txt 文件**。
- 衍生字体必须同样以 OFL 发布，且不得使用各字体声明的保留名称（Reserved Font Name）。
- 本仓库不直接把网上字体下载进版本库；接入时由维护者逐个核验许可证、保留来源 URL 与 LICENSE/OFL 文件后再纳入发行包。

---

## 一、中文候选

### 1. LXGW WenKai / 霞鹜文楷（优先接入）

- 字体名：LXGW WenKai / 霞鹜文楷
- 来源：https://github.com/lxgw/LxgwWenKai
- 授权协议：SIL Open Font License 1.1（仓库内 `OFL.txt`）
- 是否允许商业使用：是（个人与企业均可自由商用，无需付费）
- 是否允许随 App 打包分发：是（可与任何软件捆绑再分发/一并销售）
- 是否需要保留 LICENSE/OFL：是，必须随包包含 `OFL.txt`
- 保留名称：禁止衍生字体使用「霞鹜」「LXGW」
- 字符覆盖：CJK 汉字（简繁中文）+ 拉丁字母及常用符号；基于 Fontworks Klee One（同为 OFL）扩展
- 风格：文楷/手写楷体，偏书写感，适合摄影边框署名
- 备注：全量字体体积较大（约 10MB+），接入时建议做子集化（subset）后再打包，避免发行包臃肿
- 结论：**优先接入**

### 2. Maoken YingBi Kaishu / 猫啃硬笔楷书（简体版 MaokenYingBiKaiShuJ）（优先接入）

- 字体名：猫啃硬笔楷书（简体版）/ MaokenYingBiKaiShuJ
- 来源：https://github.com/maoken-fonts/MaokenYingBiKaiShuJ
- 授权协议：SIL Open Font License 1.1（仓库内 `OFL.txt`，README 明确声明）
- 是否允许商业使用：是（任何人可无偿使用，包含商用，无须告知原作者）
- 是否允许随 App 打包分发：是（可自由传送、分享，或与其他软件捆绑发行、销售）
- 是否需要保留 LICENSE/OFL：是，捆包中必须同时包含 `OFL.txt`
- 保留名称：猫啃硬笔楷书、MaokenYingBiKaiShu、MaokenYingBiKaiShuJ
- 字符覆盖：GB/T 2312-80 的 6763 个汉字及符号（简体中文为主）+ 基本拉丁字母
- 风格：硬笔楷书，手写感强且略偏严肃，适合署名/日期
- 备注：字形来自 cjkFonts「隨峰体/随峰体Plus」与 Jeffrey Xuan「曉聲通秋茄體」（均经 OFL 链路授权）
- 结论：**优先接入**（与霞鹜文楷风格互补，二选一或并存均可）

### 3. 851 Tegaki Zatsu / 851手書き雑字体（暂不接入）

- 字体名：851手書き雑字体 / 851 Tegaki Zatsu
- 来源（原作者）：http://nonty.net/items/font/851mkz/ （以及 flopdesign 分发页）
- 授权协议：**未能从原作者页面核验到明确许可证**
- 核验情况：
  - 原作者站点 `nonty.net` 访问时 TLS 证书无效（ERR_TLS_CERT_ALTNAME_INVALID），无法安全读取其利用規約
  - 分发页 `flopdesign` 返回 403/404，无法获取授权原文
  - GitHub 等仅见第三方仓库与使用引用，未见官方 LICENSE 文件
- 是否允许商业使用：**未明确**（无法核验）
- 是否允许随 App 打包分发：**未明确**（无法核验）
- 是否需要保留 LICENSE/OFL：未知
- 字符覆盖：日文假名、JIS 汉字、拉丁字母（手写杂字体风格）
- 结论：**暂不接入**。在拿到原作者页面明确、可核验的利用規约之前，不纳入发行包
- 后续动作：待原作者站点恢复或获得书面授权说明后再评估

---

## 二、英文候选（Google Fonts，均 OFL）

来源：https://fonts.google.com/ （Handwriting 分类，SIL OFL 1.1）
接入注意：Google Fonts 网站字体本身是 OFL，但接入时应**直接下载字体文件及其 OFL.txt 随包分发**，
不要在运行时依赖 Google Fonts CDN（桌面本地应用不应强依赖外网）。

| 字体名 | 风格 | 商用 | 随包分发 | 保留 LICENSE |
| --- | --- | --- | --- | --- |
| Caveat | 手写体，自然流畅 | 是 | 是 | 需 OFL |
| Permanent Marker | 马克笔风格，粗壮 | 是 | 是 | 需 OFL |
| Shadows Into Light | 轻手写 | 是 | 是 | 需 OFL |
| Homemade Apple | 随意手写签名感 | 是 | 是 | 需 OFL |
| Patrick Hand | 整洁手写 | 是 | 是 | 需 OFL |
| Kalam | 手写，含基本拉丁 | 是 | 是 | 需 OFL |
| Dancing Script | 连笔/签名风 | 是 | 是 | 需 OFL |
| Pacifico | 连笔粗体 | 是 | 是 | 需 OFL |

- 字符覆盖：以拉丁字母为主，基本不含中文/日文
- 结论：英文署名场景建议优先 **Caveat**（手写）与 **Permanent Marker**（马克笔），各保留对应 OFL.txt

---

## 三、接入建议（后续步骤）

1. 目录约定：将字体文件放入 `java-engine/src/main/resources/fonts/`，并在同目录放置各字体 `OFL.txt`（或统一 `LICENSES/` 目录）。本轮仅建本文档，暂不放入字体文件。
2. 字体注册：在 `LocalImagePreviewService.drawText` 中，将 `new Font(family, ...)` 替换为通过 `Font.createFont(Font.TRUETYPE_FONT, ...)` 加载打包字体并 `registerFont`，提供 family 别名供 `TextItem.fontFamily` 使用。
3. 字体映射：对外暴露固定 family 别名（如 `lxgw-wenkai`、`maoken-yingbi`、`caveat`、`permanent-marker`），前端只引用别名，不直接暴露物理文件名。
4. 回退链：CJK 文本回退到霞鹜文楷/猫啃硬笔楷书；拉丁文本回退到 Caveat/Permanent Marker；找不到时回退系统 SansSerif，保证渲染不中断。
5. 子集化：中文字体接入前做 subset（仅保留常用 GB2312 + 标点），控制发行包体积；保留 subset 工具脚本与来源记录。
6. 许可证随包：发行包（Electron 打包产物）必须把所用字体的 `OFL.txt` 一并纳入，并在「关于」或文档中注明字体来源与授权。
7. 暂不接入项：851 Tegaki Zatsu 待官方授权明确后再评估；任何新增字体都必须先完成本文件式的来源+授权核验。
