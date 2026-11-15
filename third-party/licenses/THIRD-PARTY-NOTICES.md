# Camera Border 随包第三方组件声明

本目录由构建脚本复制到安装包的 `professional-tools/licenses`。运行时不访问这些组件的
外部下载地址；下列来源仅用于版本和许可证核验。

## Java ImageIO

- TwelveMonkeys ImageIO 3.14.0
- 许可证：BSD-3-Clause
- Maven 坐标和校验和见 `professional-components.json`

## ExifTool

- ExifTool 13.59
- 许可证：GPL-1.0-or-later 或 Artistic-1.0-Perl
- 官方发布来源和平台归档校验和见 `professional-components.json`

## HEIC 解码链

- `heic-convert`、`heic-decode`、`libheif-js`、`jpeg-js`、`pngjs`
- 具体版本、包许可证、package.json 校验和以及许可证文件由
  `heic-components.json` 记录。

## 字体

- LXGW WenKai：SIL Open Font License 1.1，许可证见 `fonts/LXGW-WenKai-OFL.txt`
- Caveat：SIL Open Font License 1.1，许可证见 `fonts/Caveat-OFL.txt`
- 字体来源、版本提交和 SHA-256 见 `fonts/fonts.json`

## LittleCMS 2

- LittleCMS 2.19，MIT License，许可证见 `LittleCMS-LICENSE.txt`
- 源码/二进制 SHA-256 与构建说明见 `professional-components.json` 与 `professional-tools/lcms/*/lcms2.json`

## Windows RAW helper 的 zlib

zlib 1.3.1，静态链接到 Windows x64 RAW helper，源码 https://zlib.net/fossils/zlib-1.3.1.tar.gz ，SHA-256 `9a93b2b7dfdac77ceba5a558a580e74667dd6fede4585b91eefb60f03b72df23`。许可见同目录 `zlib-LICENSE.txt`。
