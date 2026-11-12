# 底片数字化共享契约用例（T02 冻结）

本目录是 Java 引擎与前端共享的 JSON 用例，字段、枚举、范围和错误码以
[docs/adr/0007-explicit-film-digitization-mode.md](../../docs/adr/0007-explicit-film-digitization-mode.md)
的 T02 契约为唯一权威。修改契约时先改 ADR，再同步本目录、Java 校验器和前端类型。

## 文件

| 文件 | 用途 |
|---|---|
| `preview-legacy.json` | 旧请求：没有 `imageProcessing`，必须继续可用 |
| `preview-film-valid.json` | 新请求：`sensor-raw` 完整配方（光源、片基、密度、正片调整、曲线、源图几何） |
| `preview-film-linear-tiff.json` | 新请求：`linear-tiff` 显式线性测试输入 |
| `invalid-image-processing-cases.json` | 非法配置数组：每项含 `name`、`expectedCode` 和 `imageProcessing` 片段 |

## 说明

- 旧请求与新请求都以 `PreviewRequest { recipe, maxWidth, maxHeight }` 形态保存；非法用例只保存
  `imageProcessing` 片段，由 Java 测试反序列化后调用 `ImageProcessingValidator`。
- `expectedCode` 使用稳定的 `IMAGE_PROCESSING_*` 错误码，不使用消息文本匹配。
- 合法的新配置在 T02 阶段结构校验通过，但生产入口返回 `501 IMAGE_PROCESSING_NOT_AVAILABLE`，
  因为处理管线尚未实现；不得静默忽略配置或按普通模式渲染。
- 本目录不保存二进制样片；真实 RAW/负片/片基样片的缺口见 ADR-0007。
