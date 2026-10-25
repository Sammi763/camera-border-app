# Stage 4 fixtures

这些文件是 Stage 4 的可追溯验收样片。照片文件保留来源文件的像素与可读取元数据；`geometry-golden.json` 和 `asymmetric-color.png` 是跨 Canvas/Java 几何与方向的固定测试输入，透明 PNG 是 Logo 文件选择与合成测试输入。

## 照片样片

| 文件 | 来源与许可 | 固定 SHA-256 | 关键验收字段 |
|---|---|---|---|
| `real-exif-canon-m03a9518.jpg` | [Wikimedia Commons: M03A9518](https://commons.wikimedia.org/wiki/File:M03A9518.jpg)，作者 Власов Егор，CC BY-SA 4.0；直接下载 `Special:FilePath` 文件，未重采样 | `e571c8aaaee182d49bfe1ca1129eedeb6c492ed5cfac746dde9e131c93931824` | Canon EOS 5D Mark IV；EF24-70mm f/2.8L II USM；f/11；1/125 s；ISO 200；31 mm；2017-05-11 15:52:33；含 GPS；Orientation=1；ICC 3144 bytes |
| `real-exif-canon-farmers-nooning.tif` | [Wikimedia Commons: William Sidney Mount, Farmers Nooning, 1836](https://commons.wikimedia.org/wiki/File:William_Sidney_Mount,_Farmers_Nooning,_1836.tif)，原作公共领域；直接下载 `Special:FilePath` 文件，未重采样 | `208fe67bca2c94d6099dfbfbb5942dfa9e1b1cb9db45a80c6647b1589d1274be` | Canon EOS-1Ds Mark II；文件为真实 TIFF；8-bit RGB；ICC 560 bytes；DateTimeOriginal=2006-12-05 03:45:51，TIFF DateTime=2006-12-20 15:51:46；相机/日期元数据由引擎读取验收 |
| `real-orientation-icc-iphone12pro.heic` | [HEIC Digital authentic samples](https://heic.digital/samples/)，`classic-car.heic`；站点明确允许 testing/development/education 使用且不要求署名；保留原始 HEIF/HEVC 文件，非合成 box | `8e2a5725aa7639678a0c10d25e1211981d81c0d94062db51e99dc002ce6ff349` | Apple iPhone 12 Pro；HEIF `irot=270°`，嵌入 Exif Orientation=1；ICC 536 bytes；2023-10-22 09:39:48；含 GPS；通过随包 HEIC 解码器转换并验收方向、颜色和导出 |

JPEG/HEIC 的页面元数据与文件内容分别以来源页面和本清单为准；来源站点的许可/使用条款可能变化，重新分发前应复核链接。GPS 仅用于本地测试，应用不会向网络上传样片。

## 非照片测试输入

| 文件 | 用途 | 固定 SHA-256 |
|---|---|---|
| `asymmetric-color.png` | 64×48 红/绿/蓝/黄非对称方向图，验证 Canvas 与 Java 的 0/90/180/270 旋转像素方向；项目生成测试图，不冒充相机样片 | `b960413787152111d72393661b242b8f4ed1db5eab37635f6d76db5f9f0c074e` |
| `transparent-logo.png` | 128×48 RGBA 透明 Logo，验证浅/深背景以及 Canvas/引擎/导出没有白底污染；项目生成测试资产 | `de168adf29004ee23d43d0c70650892258de894ab89b010570dc5753febde1bb` |
| `v1-legacy-template.json` | 明确的 v1 旧模板迁移输入，仅供迁移 E2E/单元测试；包含旧布局字段 | n/a |
| `geometry-golden.json` | Canvas 与 Java 共用的字段级几何 golden 矩阵 | n/a |
