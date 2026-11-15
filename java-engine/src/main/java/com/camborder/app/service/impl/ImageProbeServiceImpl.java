package com.camborder.app.service.impl;

import com.camborder.app.dto.ImageProbeRequest;
import com.camborder.app.dto.ImageProbeResponse;
import com.camborder.app.exception.ApiException;
import com.camborder.app.model.ImageProcessingConfig;
import com.camborder.app.service.ImageProbeService;
import com.camborder.app.util.FilmEncodedRasterReader;
import com.camborder.app.util.FilmFlextightReader;
import com.camborder.app.util.FilmRawDecoder;
import com.camborder.app.util.FilmSourceVersion;
import com.camborder.app.util.ImageMetadataPayload;
import com.camborder.app.util.ImageOrientation;
import com.camborder.app.util.ImageProcessingValidator;
import com.camborder.app.util.RawDecoder;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;

/**
 * 图像探针实现。
 *
 * 只读取容器头部/元数据，不执行去马赛克或整幅解码。RAW 的真实尺寸来自受控 helper；
 * FFF 只确认 TIFF 容器与 RGB16 主图；普通栅格用 ImageIO header。失败时如实报告
 * 像素来源不可用，不回退缩略图或内嵌 JPEG 冒充主图。
 */
@Service
public final class ImageProbeServiceImpl implements ImageProbeService {

    private static final Set<String> RAW_EXTENSIONS = Set.of(
            "nef", "cr2", "cr3", "arw", "raf", "dng", "orf", "rw2", "pef", "3fr");

    private final FilmRawDecoder rawDecoder;
    private final RawDecoder legacyRawDecoder;

    public ImageProbeServiceImpl(final FilmRawDecoder rawDecoder, final RawDecoder legacyRawDecoder) {
        this.rawDecoder = rawDecoder;
        this.legacyRawDecoder = legacyRawDecoder;
    }

    @Override
    public ImageProbeResponse probe(final ImageProbeRequest request) {
        if (request == null || request.getImagePath() == null || request.getImagePath().isBlank()) {
            throw new ApiException("imagePath is required", HttpStatus.BAD_REQUEST,
                    "IMAGE_PROBE_PATH_REQUIRED");
        }
        final Path path;
        try {
            path = Path.of(request.getImagePath());
        } catch (RuntimeException exception) {
            throw new ApiException("imagePath is invalid", HttpStatus.BAD_REQUEST,
                    "IMAGE_PROBE_PATH_INVALID");
        }
        if (!Files.isRegularFile(path) || !Files.isReadable(path)) {
            throw new ApiException("image file is missing or unreadable", HttpStatus.BAD_REQUEST,
                    "IMAGE_PROBE_FILE_UNREADABLE");
        }
        final String extension = extensionOf(path.getFileName().toString());
        final ImageProbeResponse response = new ImageProbeResponse();
        response.setImagePath(path.toAbsolutePath().normalize().toString());
        response.setFormat(extension);
        response.setSourceVersion(sourceVersion(path));
        response.setOrientation(safeOrientation(path));
        if ("fff".equals(extension)) {
            probeRaw(path, extension, response);
            if (response.getRaw() == null || !response.getRaw().isAvailable()) {
                response.getInputSources().clear();
                response.getWarnings().clear();
                probeFlextight(path, response);
            }
        } else if (RAW_EXTENSIONS.contains(extension) || legacyRawDecoder.isRawFile(path.toString())) {
            probeRaw(path, extension, response);
        } else {
            probeEncoded(path, extension, response);
        }
        checkDeclared(request.getImageProcessing(), response);
        if (request.getPairedImagePath() != null && !request.getPairedImagePath().isBlank()) {
            pair(request.getPairedImagePath(), response);
        }
        return response;
    }

    /** 只比较头部/方向/位深/比例；不宣称 TIFF 输出就是 FFF 的原始输入定义。 */
    private void pair(final String candidatePath, final ImageProbeResponse main) {
        final ImageProbeResponse.Pairing pairing = new ImageProbeResponse.Pairing();
        final ImageProbeRequest request = new ImageProbeRequest();
        request.setImagePath(candidatePath);
        ImageProbeResponse candidate;
        try {
            candidate = probe(request);
        } catch (RuntimeException exception) {
            pairing.setCandidatePath(candidatePath);
            pairing.getWarnings().add("配对候选无法探测：" + exception.getMessage());
            main.setPairing(pairing);
            return;
        }
        pairing.setCandidatePath(candidate.getImagePath());
        pairing.setCandidateFormat(candidate.getFormat());
        final int mainWidth = main.getWidth();
        final int mainHeight = main.getHeight();
        final int candidateWidth = candidate.getWidth();
        final int candidateHeight = candidate.getHeight();
        final boolean direct = mainWidth == candidateWidth && mainHeight == candidateHeight;
        final boolean swapped = mainWidth == candidateHeight && mainHeight == candidateWidth;
        pairing.setDimensionsMatch(direct || swapped);
        pairing.setOrientationMatch(main.getOrientation() == candidate.getOrientation());
        final int mainBits = main.getContainer() == null ? 0 : main.getContainer().getBitDepth();
        final int candidateBits = candidate.getContainer() == null ? 0
                : candidate.getContainer().getBitDepth();
        pairing.setBitDepthMatch(mainBits == candidateBits);
        final double mainRatio = mainHeight == 0 ? 0 : (double) mainWidth / mainHeight;
        final double candidateRatio = candidateHeight == 0 ? 0
                : (double) candidateWidth / candidateHeight;
        final double delta = Math.abs(mainRatio - candidateRatio)
                / Math.max(1e-9, Math.max(mainRatio, candidateRatio));
        pairing.setAspectRatioDelta(delta);
        pairing.setAspectRatioMatch(delta <= 0.005);
        if (!"tif".equals(candidate.getFormat()) && !"tiff".equals(candidate.getFormat())) {
            pairing.getWarnings().add("配对候选不是 TIFF；只用于几何参考，不能作为输入域证据");
        }
        if (!pairing.isDimensionsMatch() && !pairing.isAspectRatioMatch()) {
            pairing.getWarnings().add("FFF 与候选 TIFF 的尺寸/比例不一致，请检查裁切或方向");
        }
        if (!pairing.isOrientationMatch()) {
            pairing.getWarnings().add("FFF 与候选 TIFF 的方向事实不一致；方向只应在解码边界应用一次");
        }
        if (!pairing.isBitDepthMatch()) {
            pairing.getWarnings().add("FFF 主图与候选 TIFF 位深不一致");
        }
        pairing.getWarnings().add("配对只核验头部几何；输入域仍需显式选择并受控验证");
        main.setPairing(pairing);
    }

    private void probeFlextight(final Path path, final ImageProbeResponse response) {
        final ImageProbeResponse.Flextight facts = new ImageProbeResponse.Flextight();
        facts.setMainImage("rgb16");
        try {
            final FilmFlextightReader.ProbeResult probe = new FilmFlextightReader().probe(path);
            facts.setAvailable(true);
            facts.setWidth(probe.getWidth());
            facts.setHeight(probe.getHeight());
            facts.setBitDepth(probe.getBitDepth());
            facts.setBands(probe.getBands());
            facts.setAttachedImageCount(probe.getAttachedImageCount());
            response.setFlextight(facts);
            response.setWidth(probe.getWidth());
            response.setHeight(probe.getHeight());
            response.setOrientation(probe.getOrientation());
            final ImageProbeResponse.Container container = new ImageProbeResponse.Container();
            container.setWidth(probe.getWidth());
            container.setHeight(probe.getHeight());
            container.setBitDepth(probe.getBitDepth());
            container.setBands(probe.getBands());
            container.setAlpha(false);
            container.setColorModel("rgb");
            container.setImageCount(probe.getImageCount());
            container.setTiffContainer(true);
            response.setContainer(container);
            response.getInputSources().add("flextight-fff");
            response.setRecommendedInputSource("flextight-fff");
            response.setPreview(previewFacts(path));
            response.getWarnings().add("FFF 按 TIFF 容器读取 RGB16 主图；"
                    + probe.getAttachedImageCount() + " 个附属图/IFD 不参与主图处理");
            if (probe.getAttachedImageCount() > 0) {
                response.getWarnings().add("附属图与私有历史未作为原始输入；需要材料时另行受控验证");
            }
            setIcc(response, path, "fff-embedded");
        } catch (RuntimeException exception) {
            facts.setAvailable(false);
            facts.setReason(exception.getMessage() == null ? "FFF 主图不可用" : exception.getMessage());
            response.setFlextight(facts);
            response.getWarnings().add(facts.getReason());
            response.getInputSources().add("flextight-fff");
            response.setRecommendedInputSource("flextight-fff");
        }
    }

    private void probeRaw(final Path path, final String extension,
                          final ImageProbeResponse response) {
        final ImageProbeResponse.Raw facts = new ImageProbeResponse.Raw();
        facts.setDecoder("libraw");
        try {
            final FilmRawDecoder.ProbeResult probe = rawDecoder.probe(path.toString());
            final FilmRawDecoder.RawFacts raw = probe.getFacts();
            facts.setAvailable(true);
            facts.setDecoderVersion(raw.getLibrawVersion());
            facts.setMake(raw.getMake());
            facts.setModel(raw.getModel());
            facts.setRawWidth(raw.getRawWidth());
            facts.setRawHeight(raw.getRawHeight());
            facts.setWidth(raw.getWidth());
            facts.setHeight(raw.getHeight());
            facts.setSensorBitDepth(raw.getSensorBitDepth());
            facts.setBlack(raw.getBlack());
            facts.setMaximum(raw.getMaximum());
            facts.setLinearMax(raw.getLinearMax());
            facts.setCropMode(raw.getCropMode());
            facts.setFlip(raw.getFlip());
            facts.setExifOrientation(raw.getExifOrientation());
            response.setRaw(facts);
            response.setWidth(raw.getWidth());
            response.setHeight(raw.getHeight());
            response.setOrientation(raw.getExifOrientation());
            final ImageProbeResponse.Container container = new ImageProbeResponse.Container();
            container.setWidth(raw.getWidth());
            container.setHeight(raw.getHeight());
            container.setBitDepth(raw.getSensorBitDepth());
            container.setBands(3);
            container.setColorModel("camera-rgb");
            container.setImageCount(1);
            container.setTiffContainer(false);
            response.setContainer(container);
            response.getInputSources().add("camera-raw");
            response.setRecommendedInputSource("camera-raw");
            final ImageProbeResponse.Preview preview = new ImageProbeResponse.Preview();
            preview.setAvailable(false);
            preview.setNote("RAW 内嵌预览由受控 helper 按需确认；探针不把缩略图当主图");
            response.setPreview(preview);
            response.getWarnings().add("RAW 尺寸为厂商有效裁切；方向只在解码边界应用一次");
        } catch (RuntimeException exception) {
            facts.setAvailable(false);
            facts.setReason(exception.getMessage() == null ? "RAW 解码组件不可用" : exception.getMessage());
            response.setRaw(facts);
            response.getInputSources().add("camera-raw");
            response.setRecommendedInputSource("camera-raw");
            response.getWarnings().add(facts.getReason());
            response.getWarnings().add("无内嵌预览不是失败；真实 RAW 解码失败时不得回退缩略图");
        }
        response.setFormat(extension);
    }

    private void probeEncoded(final Path path, final String extension,
                              final ImageProbeResponse response) {
        final FilmEncodedRasterReader.ProbeResult probe;
        try {
            probe = new FilmEncodedRasterReader().probe(path);
        } catch (RuntimeException exception) {
            throw new ApiException(exception.getMessage() == null
                    ? "image header cannot be read" : exception.getMessage(),
                    HttpStatus.BAD_REQUEST, "IMAGE_PROBE_UNSUPPORTED");
        }
        response.setWidth(probe.getWidth());
        response.setHeight(probe.getHeight());
        response.setOrientation(probe.getOrientation());
        final ImageProbeResponse.Container container = new ImageProbeResponse.Container();
        container.setWidth(probe.getWidth());
        container.setHeight(probe.getHeight());
        container.setBitDepth(probe.getBitDepth());
        container.setBands("gray".equals(probe.getColorModel()) ? 1 : 3);
        container.setAlpha(probe.hasAlpha());
        container.setColorModel(probe.getColorModel());
        container.setImageCount(probe.getImageCount());
        container.setTiffContainer("tif".equals(extension) || "tiff".equals(extension));
        response.setContainer(container);
        response.setPreview(previewFacts(path));
        response.getInputSources().add("encoded-raster");
        response.setRecommendedInputSource("encoded-raster");
        final boolean tiff = "tif".equals(extension) || "tiff".equals(extension);
        final boolean sixteen = probe.getBitDepth() == 16;
        if (tiff && sixteen) {
            response.getInputSources().add("linear-tiff");
            response.getWarnings().add("16-bit TIFF 不证明传递函数为线性；只有显式声明线性时才可走 linear-tiff");
        }
        setIcc(response, path, "embedded");
        if (probe.getIccSha256() == null) {
            response.getWarnings().add("源文件没有嵌入 ICC；必须显式选择源色彩空间并随配方保存");
        }
        if (probe.hasAlpha()) {
            response.getWarnings().add("源文件含透明度；进入浮点工作空间前必须显式选择合成背景");
        }
        if (probe.getBitDepth() != 8 && probe.getBitDepth() != 16) {
            response.getWarnings().add("源样本位深不是 8/16，当前编码栅格输入不支持");
        }
    }

    private static void checkDeclared(final ImageProcessingConfig config,
                                      final ImageProbeResponse response) {
        if (config == null) return;
        final ImageProbeResponse.Declared declared = new ImageProbeResponse.Declared();
        final String declaredSource = config.getInputSource() != null
                ? config.getInputSource()
                : "sensor-raw".equals(config.getInputMode()) ? "camera-raw" : config.getInputMode();
        declared.setInputSource(declaredSource);
        declared.setFilmPolarity(config.getFilmPolarity());
        try {
            ImageProcessingValidator.validate(config, "");
        } catch (ApiException exception) {
            declared.setValid(false);
            declared.setReason(exception.getMessage());
            response.setDeclared(declared);
            return;
        }
        final boolean supported = response.getInputSources().contains(declaredSource);
        declared.setValid(supported);
        declared.setReason(supported ? null : "声明输入来源与实际文件格式不一致");
        response.setDeclared(declared);
    }

    private static ImageProbeResponse.Preview previewFacts(final Path path) {
        final ImageProbeResponse.Preview preview = new ImageProbeResponse.Preview();
        try (ImageInputStream input = ImageIO.createImageInputStream(path.toFile())) {
            if (input == null) {
                preview.setNote("无法创建输入流");
                return preview;
            }
            final Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) {
                preview.setNote("没有可用的 ImageIO reader");
                return preview;
            }
            final ImageReader reader = readers.next();
            try {
                reader.setInput(input, false, true);
                if (reader.getNumImages(true) > 1) {
                    preview.setWidth(reader.getWidth(1));
                    preview.setHeight(reader.getHeight(1));
                    preview.setAvailable(preview.getWidth() > 0 && preview.getHeight() > 0);
                    preview.setNote(preview.isAvailable() ? "存在附加 IFD/预览" : null);
                } else {
                    preview.setNote("没有独立附加预览 IFD");
                }
            } finally {
                reader.dispose();
            }
        } catch (Exception exception) {
            preview.setNote("附加预览探测失败");
        }
        return preview;
    }

    private static void setIcc(final ImageProbeResponse response, final Path path,
                               final String source) {
        final byte[] icc = ImageMetadataPayload.read(path.toString()).getIcc();
        final ImageProbeResponse.Icc facts = new ImageProbeResponse.Icc();
        facts.setPresent(icc != null && icc.length > 0);
        facts.setSha256(sha256(icc));
        facts.setSource(facts.isPresent() ? source : "none");
        response.setIcc(facts);
    }

    private static String sourceVersion(final Path path) {
        try {
            return FilmSourceVersion.read(path);
        } catch (RuntimeException exception) {
            throw new ApiException("source version cannot be read", HttpStatus.CONFLICT,
                    "IMAGE_PROBE_SOURCE_VERSION_FAILED");
        }
    }

    private static int safeOrientation(final Path path) {
        try {
            return ImageOrientation.read(path);
        } catch (RuntimeException exception) {
            return 1;
        }
    }

    private static String extensionOf(final String name) {
        final int dot = name.lastIndexOf('.');
        return dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    private static String sha256(final byte[] value) {
        if (value == null || value.length == 0) return null;
        try {
            final byte[] digest = MessageDigest.getInstance("SHA-256").digest(value);
            final StringBuilder result = new StringBuilder(64);
            for (byte datum : digest) result.append(String.format(Locale.ROOT, "%02x", datum));
            return result.toString();
        } catch (Exception exception) {
            return null;
        }
    }
}
