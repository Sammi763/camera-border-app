package com.camborder.app.service.impl;

import com.camborder.app.dto.PhotoMetadataResponse;
import com.camborder.app.exception.PreviewGenerationException;
import com.camborder.app.service.PhotoMetadataService;
import com.drew.imaging.ImageMetadataReader;
import com.drew.metadata.Metadata;
import com.drew.metadata.exif.ExifDirectoryBase;
import com.drew.metadata.exif.ExifIFD0Directory;
import com.drew.metadata.exif.ExifSubIFDDirectory;
import org.springframework.stereotype.Service;

import java.io.File;

/**
 * 基础 EXIF 读取服务实现（service.impl 层）。
 * 基于 metadata-extractor 读取 JPEG 基础 EXIF：相机型号、镜头型号、光圈、快门、ISO、焦距。
 *
 * 当前支持与限制（MVP 范围）：
 * - 仅读取，不写回元数据；不处理 ICC/16-bit/TIFF 高位深。
 * - 文件不存在或不可读 -> 抛受控异常 -> 400（与预览/导出一致）。
 * - 读取不到对应 EXIF 字段时该字段返回 null，整体不抛 500。
 * - 依赖 metadata-extractor 的格式识别能力；非 JPEG（如无 EXIF 的 PNG/TIFF）通常读不到字段，返回全 null。
 */
@Service
public final class ExifMetadataServiceImpl implements PhotoMetadataService {

    @Override
    public PhotoMetadataResponse readMetadata(final String imagePath) {
        File file = new File(imagePath);
        if (!file.exists()) {
            throw new PreviewGenerationException("image file not found: " + imagePath);
        }
        if (!file.isFile() || !file.canRead()) {
            throw new PreviewGenerationException("image file is not readable: " + imagePath);
        }

        try {
            Metadata metadata = ImageMetadataReader.readMetadata(file);
            ExifIFD0Directory ifd0 = metadata.getFirstDirectoryOfType(ExifIFD0Directory.class);
            ExifSubIFDDirectory subIfd = metadata.getFirstDirectoryOfType(ExifSubIFDDirectory.class);

            return new PhotoMetadataResponse(
                    readString(ifd0, subIfd, ExifDirectoryBase.TAG_MAKE, ExifDirectoryBase.TAG_MODEL),
                    readLensModel(metadata),
                    readAperture(subIfd),
                    readShutterSpeed(subIfd),
                    readIso(ifd0, subIfd),
                    readFocalLength(subIfd)
            );
        } catch (PreviewGenerationException e) {
            throw e;
        } catch (Exception e) {
            // 读取异常（损坏文件等）视为无可用 EXIF，返回全 null，不抛 500
            return new PhotoMetadataResponse(null, null, null, null, null, null);
        }
    }

    /** 读取相机型号：合并 MAKE 与 MODEL，例如 "Canon EOS R5"。读不到返回 null。 */
    private String readString(final ExifIFD0Directory ifd0, final ExifSubIFDDirectory subIfd,
                              final int makeTag, final int modelTag) {
        String make = ifd0 == null ? null : ifd0.getString(makeTag);
        String model = ifd0 == null ? null : ifd0.getString(modelTag);
        if (make == null && model == null) {
            return null;
        }
        if (make == null) {
            return model;
        }
        if (model == null) {
            return make;
        }
        // model 已包含 make 时去重，避免 "Canon Canon EOS R5"
        if (model.startsWith(make)) {
            return model;
        }
        return make + " " + model;
    }

    /** 读取镜头型号：优先 ExifSubIFD 的镜头标签，再回退到 NotesDirectory 等。读不到返回 null。 */
    private String readLensModel(final Metadata metadata) {
        ExifSubIFDDirectory subIfd = metadata.getFirstDirectoryOfType(ExifSubIFDDirectory.class);
        if (subIfd != null) {
            String lens = subIfd.getString(ExifDirectoryBase.TAG_LENS_MODEL);
            if (lens != null && !lens.isBlank()) {
                return lens;
            }
        }
        return null;
    }

    /** 读取光圈：以 f 数值字符串返回，如 "f/2.8"。读不到返回 null。 */
    private String readAperture(final ExifSubIFDDirectory subIfd) {
        if (subIfd == null) {
            return null;
        }
        Double fNumber = subIfd.getDoubleObject(ExifDirectoryBase.TAG_FNUMBER);
        if (fNumber == null) {
            fNumber = subIfd.getDoubleObject(ExifDirectoryBase.TAG_APERTURE);
            if (fNumber == null) {
                return null;
            }
        }
        return "f/" + trimTrailingZero(fNumber);
    }

    /** 读取快门速度：以分数/秒字符串返回，如 "1/125 s"。读不到返回 null。 */
    private String readShutterSpeed(final ExifSubIFDDirectory subIfd) {
        if (subIfd == null) {
            return null;
        }
        String exposure = subIfd.getString(ExifDirectoryBase.TAG_EXPOSURE_TIME);
        if (exposure == null || exposure.isBlank()) {
            return null;
        }
        return exposure.trim() + " s";
    }

    /** 读取 ISO：以数值字符串返回，如 "400"。读不到返回 null。 */
    private String readIso(final ExifIFD0Directory ifd0, final ExifSubIFDDirectory subIfd) {
        if (subIfd != null && subIfd.containsTag(ExifDirectoryBase.TAG_ISO_EQUIVALENT)) {
            return subIfd.getString(ExifDirectoryBase.TAG_ISO_EQUIVALENT);
        }
        if (ifd0 != null && ifd0.containsTag(ExifDirectoryBase.TAG_ISO_EQUIVALENT)) {
            return ifd0.getString(ExifDirectoryBase.TAG_ISO_EQUIVALENT);
        }
        return null;
    }

    /** 读取焦距：以毫米字符串返回，如 "50 mm"。读不到返回 null。 */
    private String readFocalLength(final ExifSubIFDDirectory subIfd) {
        if (subIfd == null) {
            return null;
        }
        Double focal = subIfd.getDoubleObject(ExifDirectoryBase.TAG_FOCAL_LENGTH);
        if (focal == null) {
            return null;
        }
        return trimTrailingZero(focal) + " mm";
    }

    /** 去掉 double 的小数尾零，2.0 -> "2"，2.8 -> "2.8"。 */
    private String trimTrailingZero(final double value) {
        if (value == Math.floor(value)) {
            return Long.toString((long) value);
        }
        return Double.toString(value);
    }
}
