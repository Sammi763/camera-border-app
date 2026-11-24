package com.camborder.app.service.impl;

import com.camborder.app.dto.ExportSettings;
import com.camborder.app.dto.SourceDecode;
import com.camborder.app.exception.FilmProcessingException;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.util.FloatImageOps;
import com.camborder.app.util.FloatRgbImage;
import com.camborder.app.util.ImageEncoder;
import com.camborder.app.util.ImageProcessingValidator;
import com.camborder.app.util.SourceImageInfo;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.awt.color.ColorSpace;
import java.awt.color.ICC_Profile;
import java.awt.image.BufferedImage;

/**
 * 底片模式导出：照片、几何和装饰通过共享浮点合成器处理，最后编码为 sRGB JPEG、
 * 16-bit sRGB TIFF 或线性 Rec.2020 TIFF。不带框母版保留图片几何，只去除装饰。
 * ICC 与实际像素编码匹配，元数据写回及输出事实复用受控专业编码路径。
 */
@Service
public final class FilmExportService {

    public static final String CODE_ICC_UNAVAILABLE = "FILM_OUTPUT_ICC_UNAVAILABLE";
    public static final String CODE_OUTPUT_INVALID = "FILM_OUTPUT_INVALID";

    private final FilmProcessingPipeline pipeline;
    private final ImageEncoder imageEncoder;
    private final com.camborder.app.util.FilmCompositor compositor;

    @Autowired
    public FilmExportService(final FilmProcessingPipeline pipeline, final ImageEncoder encoder,
                             final com.camborder.app.util.FilmCompositor compositor) {
        this.pipeline = pipeline; this.imageEncoder = encoder; this.compositor = compositor;
    }

    private static boolean isBorderless(final RenderRecipe recipe, final ExportSettings export) {
        final Boolean borderless = recipe.getBorderlessMaster();
        return borderless == null ? export.isBorderlessMaster() : borderless;
    }

    /** 预期事实独立于完成报告；未编码时始终 verified=false。 */
    public com.camborder.app.dto.FidelityReport preflight(final RenderRecipe recipe, final ExportSettings export,
                                                        final String expectedSourceVersion) {
        try (com.camborder.app.util.FilmRequestGuard.Scope ignored = com.camborder.app.util.FilmRequestGuard.open(null, 0)) {
            final FilmProcessingPipeline.SourceDescription source = pipeline.describeSource(recipe);
            if (expectedSourceVersion != null && !expectedSourceVersion.equals(source.sourceVersion))
                throw new FilmProcessingException("源图已变化，请刷新预览", HttpStatus.CONFLICT, "FILM_SOURCE_CHANGED");
            final int[] size = com.camborder.app.util.FilmCompositor.dimensions(source.decode.getFullWidth(), source.decode.getFullHeight(), recipe,
                    export.getMaxWidth(), export.getMaxHeight(), isBorderless(recipe, export));
            if ((long) size[0] * size[1] > 200_000_000L) throw new IllegalArgumentException("合成画布超过像素上限");
            final com.camborder.app.dto.FidelityReport report = com.camborder.app.dto.FidelityReport.preflight("custom", export.getFormat());
            report.setFidelityScope("processed"); report.setPixelSource(source.info.getPixelSource());
            report.setMetadataSource(source.info.getMetadataSource()); report.setSource(source.info.toFacts());
            final com.camborder.app.dto.FidelityReport.Facts output = new com.camborder.app.dto.FidelityReport.Facts();
            output.setWidth(size[0]); output.setHeight(size[1]); output.setBitDepth("srgb-jpeg".equals(export.getFilmOutput()) ? 8 : 16);
            output.setColorSpace("tiff16-rec2020".equals(export.getFilmOutput()) ? "linear-rec2020" : "sRGB");
            output.setWorkingDataType("float32"); output.setSourceVersion(source.sourceVersion);
            report.setOutput(output); return report;
        }
    }

    public static final class Result {
        private final ImageEncoder.ExportResult exportResult;
        private final SourceDecode sourceDecode;
        private final SourceImageInfo sourceInfo;
        private final String recipeSignature;

        private Result(final ImageEncoder.ExportResult exportResult, final SourceDecode sourceDecode,
                       final SourceImageInfo sourceInfo, final String recipeSignature) {
            this.exportResult = exportResult;
            this.sourceDecode = sourceDecode;
            this.sourceInfo = sourceInfo;
            this.recipeSignature = recipeSignature;
        }

        public ImageEncoder.ExportResult getExportResult() { return exportResult; }
        public SourceDecode getSourceDecode() { return sourceDecode; }
        public SourceImageInfo getSourceInfo() { return sourceInfo; }
        public String getRecipeSignature() { return recipeSignature; }
    }

    public Result export(final RenderRecipe recipe, final ExportSettings export) {
        return export(recipe, export, null);
    }

    /** 校验实际解码的来源，关闭队列检查与真正读取之间的文件替换窗口。 */
    public Result export(final RenderRecipe recipe, final ExportSettings export, final String expectedSourceVersion) {
        try (com.camborder.app.util.FilmRequestGuard.Scope ignored = com.camborder.app.util.FilmRequestGuard.open(null, 0)) {
            return exportUnlocked(recipe, export, expectedSourceVersion);
        }
    }

    private Result exportUnlocked(final RenderRecipe recipe, final ExportSettings export, final String expectedSourceVersion) {
        if (recipe == null || recipe.getImageProcessing() == null) {
            throw new FilmProcessingException("底片导出需要 imageProcessing 配置",
                    HttpStatus.BAD_REQUEST, CODE_OUTPUT_INVALID);
        }
        ImageProcessingValidator.validateFilmOutput(export, recipe.getImageProcessing(), "");
        final boolean borderless = isBorderless(recipe, export);
        try (FilmProcessingPipeline.Processed processed = pipeline.processForOutput(recipe,
                "current-positive", export.getMaxWidth(), export.getMaxHeight(),
                borderless)) {
            if (expectedSourceVersion != null && !expectedSourceVersion.equals(processed.getSourceVersion())) {
                throw new FilmProcessingException("读取时源文件已变化，请刷新并重新预检",
                        HttpStatus.CONFLICT, "FILM_SOURCE_CHANGED");
            }
            final FloatRgbImage image = compositor.compose(processed.getImage(), recipe,
                    export.getMaxWidth(), export.getMaxHeight(), borderless);
            final byte[] srgbIcc = srgbIcc();
            final byte[] outputIcc;
            final BufferedImage outputImage;
            if ("srgb-jpeg".equals(export.getFilmOutput())) {
                outputIcc = srgbIcc;
                outputImage = FloatImageOps.toBufferedImage8(image);
            } else if ("tiff16-srgb".equals(export.getFilmOutput())) {
                outputIcc = srgbIcc;
                outputImage = FloatImageOps.toBufferedImage16(image);
            } else if ("tiff16-rec2020".equals(export.getFilmOutput())) {
                outputIcc = com.camborder.app.util.FilmOutputProfile.linearRec2020();
                outputImage = com.camborder.app.util.FilmOutputProfile.toLinearRec2020(image);
            } else {
                throw new FilmProcessingException("filmOutput 非法", HttpStatus.BAD_REQUEST, CODE_OUTPUT_INVALID);
            }
            final long[] low = new long[3]; final long[] high = new long[3];
            final float[] pixel = new float[3]; final float[] target = new float[3];
            for (int y = 0; y < image.getHeight(); y++) {
                com.camborder.app.util.FilmRequestGuard.check();
                for (int x = 0; x < image.getWidth(); x++) {
                    for (int c = 0; c < 3; c++) pixel[c] = image.get(x, y, c);
                    if ("tiff16-rec2020".equals(export.getFilmOutput())) System.arraycopy(pixel, 0, target, 0, 3);
                    else com.camborder.app.util.FilmColorSpace.linearRec2020ToSrgb(pixel, target);
                    for (int c = 0; c < 3; c++) { if (target[c] <= 0) low[c]++; if (target[c] >= 1) high[c]++; }
                }
            }
            final ImageEncoder.ExportResult result = imageEncoder.writeProcessedFilm(outputImage, export,
                    recipe.getImagePath(), processed.getSourceInfo(), outputIcc, processed.getRecipeSignature(),
                    processed.getSourceVersion(), recipe.getImageProcessing().getAlgorithmVersion());
            result.getFidelityReport().getOutputClipping().put("low", low);
            result.getFidelityReport().getOutputClipping().put("high", high);
            return new Result(result, processed.getSourceDecode(), processed.getSourceInfo(), processed.getRecipeSignature());
        }
    }

    private byte[] srgbIcc() {
        try {
            return ICC_Profile.getInstance(ColorSpace.CS_sRGB).getData();
        } catch (RuntimeException exception) {
            throw new FilmProcessingException("sRGB ICC 不可用",
                    HttpStatus.INTERNAL_SERVER_ERROR, CODE_ICC_UNAVAILABLE);
        }
    }

}
