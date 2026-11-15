// 底片数字化真实 RAW helper（LibRaw 受控子进程）。
//
// 这是 Java 引擎的内部实现部件，不是第四个业务服务。协议：
//   film-raw-helper --version
//   film-raw-helper --input <raw> --output <bin> --metadata <json>
//                    [--crop vendor-inset|full-sensor]
//                    [--white-balance camera|daylight]
//                    [--highlight clip|unclip]
//                    [--max-pixels <n>]
//
// 输出二进制为 RGB16 小端交错数据，头部 28 字节：
//   magic "FRW1" | width u32 | height u32 | channels u16=3 | bits u16=16
//   | exifOrientation i32 | sensorBitDepth u16 | reserved u16 | dataBytes u32
// 像素为线性 camera RGB（已去黑、相机白平衡、AHD 插值），不应用输出矩阵；
// 方向不在此处旋转，只报告 EXIF Orientation，由 Java 解码边界统一应用一次。
#include "libraw/libraw.h"

#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#ifdef _WIN32
#include <windows.h>
#endif

namespace {

constexpr int EXIT_USAGE = 2;
constexpr int EXIT_OPEN = 3;
constexpr int EXIT_UNPACK = 4;
constexpr int EXIT_PROCESS = 5;
constexpr int EXIT_OUTPUT = 6;
constexpr int EXIT_LIMIT = 7;
constexpr int EXIT_METADATA = 8;
constexpr const char *HELPER_VERSION = "1.1.1";

// Windows 使用 UTF-16 文件 API，保持中文源路径与临时目录可用。
#ifdef _WIN32
std::wstring widePath(const std::string &text) {
    const int size = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, text.c_str(), -1, nullptr, 0);
    if (size <= 0) return {};
    std::vector<wchar_t> out(size);
    MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, text.c_str(), -1, out.data(), size);
    return std::wstring(out.data());
}
#endif
FILE *openUtf8File(const std::string &path, const char *mode) {
#ifdef _WIN32
    const auto wide = widePath(path);
    const auto wideMode = widePath(mode);
    return _wfopen(wide.c_str(), wideMode.c_str());
#else
    return std::fopen(path.c_str(), mode);
#endif
}

struct Options {
    std::string input;
    std::string output;
    std::string metadata;
    std::string crop = "vendor-inset";
    std::string whiteBalance = "camera";
    std::string highlight = "clip";
    long long maxPixels = 150000000LL;
    bool version = false;
    bool probe = false;
};

// dcraw_process 会修改 black/pre_mul/flip 等字段，必须在处理前冻结原始事实。
struct RawFacts {
    std::string make;
    std::string model;
    std::string software;
    int rawWidth = 0;
    int rawHeight = 0;
    int topMargin = 0;
    int leftMargin = 0;
    int flip = 0;
    int exifOrientation = 1;
    unsigned sensorBitDepth = 0;
    unsigned black = 0;
    unsigned maximum = 0;
    unsigned linearMax[4] = {0, 0, 0, 0};
    float camMul[4] = {0, 0, 0, 0};
    float preMul[4] = {0, 0, 0, 0};
    float rgbCam[3][4] = {{0}};
    float camXyz[4][3] = {{0}};
    int thumbnailCount = 0;
    unsigned thumbWidth = 0;
    unsigned thumbHeight = 0;
};

void usage() {
    std::fprintf(stderr,
                 "usage: film-raw-helper --version\n"
                 "       film-raw-helper --probe --input <raw>\n"
                 "       film-raw-helper --input <raw> --output <bin> --metadata <json>\n"
                 "                        [--crop vendor-inset|full-sensor]\n"
                 "                        [--white-balance camera|daylight]\n"
                 "                        [--highlight clip|unclip]\n"
                 "                        [--max-pixels <n>]\n");
}

bool parseLongLong(const char *value, long long *result) {
    if (!value || !*value) return false;
    char *end = nullptr;
    const long long parsed = std::strtoll(value, &end, 10);
    if (!end || *end != '\0' || parsed <= 0) return false;
    *result = parsed;
    return true;
}

bool parseOptions(int argc, char **argv, Options *options) {
    for (int index = 1; index < argc; index++) {
        const std::string arg = argv[index];
        if (arg == "--version") {
            options->version = true;
            continue;
        }
        if (arg == "--probe") {
            options->probe = true;
            continue;
        }
        if (arg == "--input" || arg == "--output" || arg == "--metadata"
                || arg == "--crop" || arg == "--white-balance"
                || arg == "--highlight" || arg == "--max-pixels") {
            if (index + 1 >= argc) return false;
            const std::string value = argv[++index];
            if (arg == "--input") options->input = value;
            else if (arg == "--output") options->output = value;
            else if (arg == "--metadata") options->metadata = value;
            else if (arg == "--crop") options->crop = value;
            else if (arg == "--white-balance") options->whiteBalance = value;
            else if (arg == "--highlight") options->highlight = value;
            else if (arg == "--max-pixels") {
                if (!parseLongLong(value.c_str(), &options->maxPixels)) return false;
            }
            continue;
        }
        return false;
    }
    return true;
}

int exifOrientationFromFlip(int flip) {
    // dcraw/LibRaw flip bits: bit0 水平镜像，bit1 垂直镜像，bit2 转置。
    switch (flip) {
        case 0: return 1;
        case 1: return 2;
        case 2: return 4;
        case 3: return 3;
        case 4: return 5;
        case 5: return 8; // 90° CCW，等价 EXIF Rotate 270 CW
        case 6: return 6; // 90° CW
        case 7: return 7;
        default: return 1;
    }
}

std::string jsonEscape(const char *value) {
    std::string result;
    for (const char *p = value; p && *p; ++p) {
        const unsigned char c = static_cast<unsigned char>(*p);
        if (c == '"' || c == '\\') {
            result.push_back('\\');
            result.push_back(static_cast<char>(c));
        } else if (c < 0x20) {
            char buffer[8];
            std::snprintf(buffer, sizeof(buffer), "\\u%04x", c);
            result += buffer;
        } else {
            result.push_back(static_cast<char>(c));
        }
    }
    return result;
}

bool writeAll(FILE *file, const void *data, size_t bytes) {
    return bytes == 0 || std::fwrite(data, 1, bytes, file) == bytes;
}

bool writeU16LE(FILE *file, uint16_t value) {
    const unsigned char bytes[2] = {
            static_cast<unsigned char>(value & 0xff),
            static_cast<unsigned char>((value >> 8) & 0xff)};
    return writeAll(file, bytes, sizeof(bytes));
}

bool writeU32LE(FILE *file, uint32_t value) {
    const unsigned char bytes[4] = {
            static_cast<unsigned char>(value & 0xff),
            static_cast<unsigned char>((value >> 8) & 0xff),
            static_cast<unsigned char>((value >> 16) & 0xff),
            static_cast<unsigned char>((value >> 24) & 0xff)};
    return writeAll(file, bytes, sizeof(bytes));
}

bool writeI32LE(FILE *file, int32_t value) {
    return writeU32LE(file, static_cast<uint32_t>(value));
}

bool writeFactsJson(FILE *file, const Options &options, const RawFacts &facts,
                    int width, int height) {
    std::fprintf(file,
                 "{\"schemaVersion\":1,\"helperVersion\":\"%s\",\"librawVersion\":\"%s\","
                 "\"inputPath\":\"%s\",\"make\":\"%s\",\"model\":\"%s\",\"software\":\"%s\","
                 "\"rawWidth\":%d,\"rawHeight\":%d,\"cropMode\":\"%s\","
                 "\"width\":%d,\"height\":%d,\"topMargin\":%d,\"leftMargin\":%d,"
                 "\"flip\":%d,\"exifOrientation\":%d,\"sensorBitDepth\":%u,"
                 "\"black\":%u,\"maximum\":%u,\"linearMax\":[%u,%u,%u,%u],"
                 "\"whiteBalance\":\"%s\",\"highlight\":\"%s\","
                 "\"camMul\":[%.9g,%.9g,%.9g,%.9g],"
                 "\"preMul\":[%.9g,%.9g,%.9g,%.9g],"
                 "\"rgbCam\":[[%.9g,%.9g,%.9g,%.9g],[%.9g,%.9g,%.9g,%.9g],[%.9g,%.9g,%.9g,%.9g]],"
                 "\"camXyz\":[[%.9g,%.9g,%.9g],[%.9g,%.9g,%.9g],[%.9g,%.9g,%.9g],[%.9g,%.9g,%.9g]],"
                 "\"thumbnailCount\":%d,\"thumbWidth\":%u,\"thumbHeight\":%u}",
                 HELPER_VERSION, LibRaw::version(),
                 jsonEscape(options.input.c_str()).c_str(),
                 jsonEscape(facts.make.c_str()).c_str(), jsonEscape(facts.model.c_str()).c_str(),
                 jsonEscape(facts.software.c_str()).c_str(),
                 facts.rawWidth, facts.rawHeight, options.crop.c_str(),
                 width, height, facts.topMargin, facts.leftMargin,
                 facts.flip, facts.exifOrientation, facts.sensorBitDepth,
                 facts.black, facts.maximum,
                 facts.linearMax[0], facts.linearMax[1],
                 facts.linearMax[2], facts.linearMax[3],
                 options.whiteBalance.c_str(), options.highlight.c_str(),
                 facts.camMul[0], facts.camMul[1], facts.camMul[2], facts.camMul[3],
                 facts.preMul[0], facts.preMul[1], facts.preMul[2], facts.preMul[3],
                 facts.rgbCam[0][0], facts.rgbCam[0][1], facts.rgbCam[0][2], facts.rgbCam[0][3],
                 facts.rgbCam[1][0], facts.rgbCam[1][1], facts.rgbCam[1][2], facts.rgbCam[1][3],
                 facts.rgbCam[2][0], facts.rgbCam[2][1], facts.rgbCam[2][2], facts.rgbCam[2][3],
                 facts.camXyz[0][0], facts.camXyz[0][1], facts.camXyz[0][2],
                 facts.camXyz[1][0], facts.camXyz[1][1], facts.camXyz[1][2],
                 facts.camXyz[2][0], facts.camXyz[2][1], facts.camXyz[2][2],
                 facts.camXyz[3][0], facts.camXyz[3][1], facts.camXyz[3][2],
                 facts.thumbnailCount, facts.thumbWidth, facts.thumbHeight);
    return std::ferror(file) == 0;
}

bool writeMetadata(const Options &options, const RawFacts &facts, int width, int height) {
    FILE *file = openUtf8File(options.metadata, "wb");
    if (!file) return false;
    const bool ok = writeFactsJson(file, options, facts, width, height);
    std::fclose(file);
    return ok;
}

void captureFacts(const libraw_data_t &data, RawFacts *facts) {
    facts->make = data.idata.make;
    facts->model = data.idata.model;
    facts->software = data.idata.software;
    facts->rawWidth = data.sizes.raw_width;
    facts->rawHeight = data.sizes.raw_height;
    facts->topMargin = data.sizes.top_margin;
    facts->leftMargin = data.sizes.left_margin;
    facts->flip = data.sizes.flip;
    facts->exifOrientation = exifOrientationFromFlip(facts->flip);
    facts->sensorBitDepth = data.color.raw_bps;
    facts->black = data.color.black;
    facts->maximum = data.color.maximum;
    for (int index = 0; index < 4; index++) {
        facts->linearMax[index] = data.color.linear_max[index];
        facts->camMul[index] = data.color.cam_mul[index];
        facts->preMul[index] = data.color.pre_mul[index];
    }
    for (int row = 0; row < 3; row++) {
        for (int column = 0; column < 4; column++) {
            facts->rgbCam[row][column] = data.color.rgb_cam[row][column];
        }
    }
    // rgb_cam 是 3×4，cam_xyz 是 4×3，不能共用索引循环。
    for (int row = 0; row < 4; row++) {
        for (int column = 0; column < 3; column++) {
            facts->camXyz[row][column] = data.color.cam_xyz[row][column];
        }
    }
    facts->thumbnailCount = data.thumbs_list.thumbcount;
    facts->thumbWidth = data.thumbnail.twidth;
    facts->thumbHeight = data.thumbnail.theight;
}

} // namespace

int runHelper(int argc, char **argv) {
    Options options;
    if (!parseOptions(argc, argv, &options)) {
        usage();
        return EXIT_USAGE;
    }
    if (options.version) {
        std::printf("film-raw-helper %s libraw %s\n", HELPER_VERSION, LibRaw::version());
        return 0;
    }
    if (options.input.empty()) {
        usage();
        return EXIT_USAGE;
    }
    if (!options.probe && (options.output.empty() || options.metadata.empty())) {
        usage();
        return EXIT_USAGE;
    }
    if (options.crop != "vendor-inset" && options.crop != "full-sensor") {
        usage();
        return EXIT_USAGE;
    }
    if (options.whiteBalance != "camera" && options.whiteBalance != "daylight") {
        usage();
        return EXIT_USAGE;
    }
    if (options.highlight != "clip" && options.highlight != "unclip") {
        usage();
        return EXIT_USAGE;
    }

    LibRaw decoder;
#ifdef _WIN32
    int rc = decoder.open_file(widePath(options.input).c_str());
#else
    int rc = decoder.open_file(options.input.c_str());
#endif
    if (rc != LIBRAW_SUCCESS) {
        std::fprintf(stderr, "open_file failed: %s\n", libraw_strerror(rc));
        return EXIT_OPEN;
    }
    if (options.probe) {
        // 只读取尺寸与源事实：不 unpack、不去马赛克、不生成像素。
        const libraw_data_t &probeData = decoder.imgdata;
        RawFacts probeFacts;
        captureFacts(probeData, &probeFacts);
        int probeWidth = probeData.sizes.width;
        int probeHeight = probeData.sizes.height;
        if (probeWidth <= 0 || probeHeight <= 0) {
            probeWidth = probeData.sizes.raw_width;
            probeHeight = probeData.sizes.raw_height;
        }
        const long long probePixels = static_cast<long long>(probeWidth) * probeHeight;
        if (probePixels <= 0 || probePixels > options.maxPixels) {
            std::fprintf(stderr, "probe pixel count out of range: %lld (max %lld)\n",
                         probePixels, options.maxPixels);
            return EXIT_LIMIT;
        }
        if (!writeFactsJson(stdout, options, probeFacts, probeWidth, probeHeight)) {
            std::fprintf(stderr, "probe metadata write failed\n");
            return EXIT_METADATA;
        }
        return 0;
    }
    rc = decoder.unpack();
    if (rc != LIBRAW_SUCCESS) {
        std::fprintf(stderr, "unpack failed: %s\n", libraw_strerror(rc));
        return EXIT_UNPACK;
    }
    if (options.crop == "vendor-inset") {
        decoder.adjust_to_raw_inset_crop(1);
    }
    libraw_data_t &data = decoder.imgdata;
    const long long pixels = static_cast<long long>(data.sizes.width) * data.sizes.height;
    if (pixels <= 0 || pixels > options.maxPixels) {
        std::fprintf(stderr, "pixel count out of range: %lld (max %lld)\n", pixels, options.maxPixels);
        return EXIT_LIMIT;
    }

    // 处理前冻结源事实：dcraw_process 会改写 black/pre_mul/flip/maximum。
    RawFacts facts;
    captureFacts(data, &facts);

    data.params.output_color = 0; // 线性 camera RGB，由 Java 侧按 rgbCam/camXyz 转工作空间
    data.params.output_bps = 16;
    data.params.use_camera_wb = options.whiteBalance == "camera" ? 1 : 0;
    data.params.use_auto_wb = 0;
    data.params.no_auto_bright = 1;
    data.params.gamm[0] = 1.0;
    data.params.gamm[1] = 1.0;
    data.params.highlight = options.highlight == "unclip" ? 1 : 0;
    data.params.user_qual = 3; // AHD
    data.params.output_tiff = 0;
    data.params.user_flip = 0; // 方向由 Java 解码边界应用一次
    data.params.use_fuji_rotate = 1;

    rc = decoder.dcraw_process();
    if (rc != LIBRAW_SUCCESS) {
        std::fprintf(stderr, "dcraw_process failed: %s\n", libraw_strerror(rc));
        return EXIT_PROCESS;
    }
    int width = 0;
    int height = 0;
    libraw_processed_image_t *processed = decoder.dcraw_make_mem_image(&rc);
    if (!processed || rc != LIBRAW_SUCCESS || processed->bits != 16 || processed->colors != 3) {
        std::fprintf(stderr, "make_mem_image failed or returned unsupported format\n");
        if (processed) LibRaw::dcraw_clear_mem(processed);
        return EXIT_PROCESS;
    }
    width = processed->width;
    height = processed->height;
    const uint32_t dataBytes = static_cast<uint32_t>(
            static_cast<uint64_t>(width) * height * 3 * 2);

    FILE *output = openUtf8File(options.output, "wb");
    if (!output) {
        std::fprintf(stderr, "cannot open output\n");
        LibRaw::dcraw_clear_mem(processed);
        return EXIT_OUTPUT;
    }
    bool ok = writeAll(output, "FRW1", 4)
            && writeU32LE(output, static_cast<uint32_t>(width))
            && writeU32LE(output, static_cast<uint32_t>(height))
            && writeU16LE(output, 3)
            && writeU16LE(output, 16)
            && writeI32LE(output, facts.exifOrientation)
            && writeU16LE(output, static_cast<uint16_t>(facts.sensorBitDepth))
            && writeU16LE(output, 0)
            && writeU32LE(output, dataBytes);
    if (ok) {
        const ushort *source = reinterpret_cast<const ushort *>(processed->data);
        std::vector<unsigned char> row(static_cast<size_t>(width) * 3 * 2);
        for (int y = 0; y < height && ok; y++) {
            size_t offset = 0;
            for (int x = 0; x < width; x++) {
                const ushort *pixel = source + (static_cast<size_t>(y) * width + x) * processed->colors;
                for (int channel = 0; channel < 3; channel++) {
                    const ushort value = pixel[channel];
                    row[offset++] = static_cast<unsigned char>(value & 0xff);
                    row[offset++] = static_cast<unsigned char>((value >> 8) & 0xff);
                }
            }
            ok = writeAll(output, row.data(), row.size());
        }
    }
    std::fclose(output);
    LibRaw::dcraw_clear_mem(processed);
    if (!ok) {
        std::remove(options.output.c_str());
        std::fprintf(stderr, "output write failed\n");
        return EXIT_OUTPUT;
    }
    if (!writeMetadata(options, facts, width, height)) {
        std::remove(options.output.c_str());
        std::fprintf(stderr, "metadata write failed\n");
        return EXIT_METADATA;
    }
    return 0;
}

#ifdef _WIN32
int wmain(int argc, wchar_t **argv) {
    std::vector<std::string> values;
    values.reserve(argc);
    for (int i = 0; i < argc; i++) {
        const int size = WideCharToMultiByte(CP_UTF8, 0, argv[i], -1, nullptr, 0, nullptr, nullptr);
        if (size <= 0) return EXIT_USAGE;
        std::vector<char> value(size);
        WideCharToMultiByte(CP_UTF8, 0, argv[i], -1, value.data(), size, nullptr, nullptr);
        values.emplace_back(value.data());
    }
    std::vector<char *> args;
    for (auto &value : values) args.push_back(value.data());
    return runHelper(argc, args.data());
}
#else
int main(int argc, char **argv) { return runHelper(argc, argv); }
#endif
