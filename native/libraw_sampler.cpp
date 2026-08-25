/*
 * camborder-libraw-sampler — LibRaw 默认显影命令行封装。
 *
 * 用途：Camera Border App 的 Java 引擎以受控子进程方式调用本程序，
 * 对 RAW 文件执行 LibRaw 默认显影并写出 8-bit TIFF：
 *
 *     camborder-libraw-sampler <input.raw> <output.tiff>
 *
 * 行为约定（与 java-engine LibRawCliDevelopServiceImpl 的契约一致）：
 * - 成功：exit 0，输出 TIFF 文件；
 * - 失败：非 0 退出码，原因写入 stderr（引擎取前 300 字符作为降级说明）；
 * - 不做任何用户调节（曝光/白平衡/曲线/降噪/镜头校正），仅默认显影；
 * - 输出使用 LibRaw 内置 TIFF writer（dcraw_ppm_tiff_writer），不依赖 libjpeg 等
 *   第三方图像库，便于三平台静态分发。
 *
 * 构建脚本：scripts/build-libraw.sh（克隆 LibRaw → 编译静态库 → 编译本封装）。
 * 随包布局：<resources>/libraw/camborder-libraw-sampler(.exe)，
 * Electron 经环境变量 CAMBORDER_LIBRAW_PATH 注入路径给 Java 引擎。
 */

#include "libraw/libraw.h"
#include <cstdio>
#include <cstring>

int main(int argc, char **argv)
{
    if (argc != 3) {
        std::fprintf(stderr, "usage: %s <input.raw> <output.tiff>\n", argv[0]);
        return 2;
    }

    LibRaw processor;

    // 打开 RAW 文件（读取真实传感器数据）
    int ret = processor.open_file(argv[1]);
    if (ret != LIBRAW_SUCCESS) {
        std::fprintf(stderr, "open_file failed: %s\n", LibRaw::strerror(ret));
        return 3;
    }

    // 默认显影参数：不放大、相机白平衡、sRGB、8-bit
    processor.imgdata.params.no_auto_bright = 0;
    processor.imgdata.params.use_camera_wb = 1;
    processor.imgdata.params.output_bps = 8;
    processor.imgdata.params.gamm[0] = 1.0 / 2.222;
    processor.imgdata.params.gamm[1] = 4.5;
    processor.imgdata.params.output_tiff = 0; /* 内置 tiff writer 使用非压缩 tiff 路径 */

    ret = processor.unpack();
    if (ret != LIBRAW_SUCCESS) {
        std::fprintf(stderr, "unpack failed: %s\n", LibRaw::strerror(ret));
        return 4;
    }

    ret = processor.dcraw_process();
    if (ret != LIBRAW_SUCCESS) {
        std::fprintf(stderr, "dcraw_process failed: %s\n", LibRaw::strerror(ret));
        return 5;
    }

    ret = processor.dcraw_ppm_tiff_writer(argv[2]);
    if (ret != LIBRAW_SUCCESS) {
        std::fprintf(stderr, "tiff writer failed: %s\n", LibRaw::strerror(ret));
        return 6;
    }

    processor.recycle();
    return 0;
}
