package com.camborder.app.service.impl;

import com.camborder.app.dto.ImageProbeRequest;
import com.camborder.app.dto.ImageProbeResponse;
import com.camborder.app.exception.ApiException;
import com.camborder.app.model.ImageProcessingConfig;
import com.camborder.app.util.FilmRawDecoder;
import com.camborder.app.util.FilmTestFixtures;
import com.camborder.app.util.RawDecoder;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 图像探针：8/16-bit、FFF 容器、声明核对、缺失/损坏文件。 */
final class ImageProbeServiceTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final ImageProbeServiceImpl service = new ImageProbeServiceImpl(
            new FilmRawDecoder("", mapper), new RawDecoder());

    @Test
    void pngProbeReportsContainerAndSourceFactsWithoutDecoding(@TempDir final Path temp)
            throws Exception {
        final Path path = temp.resolve("scan.png");
        ImageIO.write(new BufferedImage(7, 5, BufferedImage.TYPE_INT_RGB), "png", path.toFile());

        final ImageProbeResponse response = service.probe(request(path));

        assertThat(response.getStatus()).isEqualTo("ok");
        assertThat(response.getFormat()).isEqualTo("png");
        assertThat(response.getWidth()).isEqualTo(7);
        assertThat(response.getHeight()).isEqualTo(5);
        assertThat(response.getContainer().getBitDepth()).isEqualTo(8);
        assertThat(response.getInputSources()).contains("encoded-raster");
        assertThat(response.getRecommendedInputSource()).isEqualTo("encoded-raster");
        assertThat(response.getSourceVersion()).startsWith("sha256:");
    }

    @Test
    void sixteenBitTiffAlsoAdvertisesLinearCandidateWithWarning(@TempDir final Path temp)
            throws Exception {
        final Path path = FilmTestFixtures.writeLinearTiff(temp, 1, 1,
                new int[]{4097, 4097, 4097});
        final ImageProbeResponse response = service.probe(request(path));

        assertThat(response.getContainer().getBitDepth()).isEqualTo(16);
        assertThat(response.getInputSources()).contains("encoded-raster", "linear-tiff");
        assertThat(response.getWarnings()).anyMatch(value -> value.contains("不证明传递函数为线性"));
    }

    @Test
    void flextightFffMainImageAndAttachedImagesAreSeparated(@TempDir final Path temp)
            throws Exception {
        final Path tiff = FilmTestFixtures.writeLinearTiff(temp, 3, 2,
                FilmTestFixtures.constantSamples(6, new int[]{12000, 14000, 16000}));
        final Path fff = temp.resolve("flextight.fff");
        Files.move(tiff, fff);

        final ImageProbeResponse response = service.probe(request(fff));

        assertThat(response.getFormat()).isEqualTo("fff");
        assertThat(response.getFlextight().isAvailable()).isTrue();
        assertThat(response.getFlextight().getBitDepth()).isEqualTo(16);
        assertThat(response.getFlextight().getAttachedImageCount()).isZero();
        assertThat(response.getInputSources()).contains("flextight-fff");
        assertThat(response.getWarnings()).anyMatch(value -> value.contains("RGB16 主图"));
    }

    @Test
    void eightBitFffIsNotPretendedToBeRgb16(@TempDir final Path temp) throws Exception {
        final Path png = temp.resolve("scan.png");
        ImageIO.write(new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB), "png", png.toFile());
        final Path fff = temp.resolve("not-rgb16.fff");
        Files.move(png, fff);

        final ImageProbeResponse response = service.probe(request(fff));

        assertThat(response.getFlextight().isAvailable()).isFalse();
        assertThat(response.getWarnings()).isNotEmpty();
    }

    @Test
    void pairsFffWithCandidateTiffForGeometryOnly(@TempDir final Path temp) throws Exception {
        final Path tiff = FilmTestFixtures.writeLinearTiff(temp, 3, 2,
                FilmTestFixtures.constantSamples(6, new int[]{12000, 14000, 16000}));
        final Path fff = temp.resolve("flextight.fff");
        Files.copy(tiff, fff);
        final ImageProbeRequest request = request(fff);
        request.setPairedImagePath(tiff.toString());

        final ImageProbeResponse response = service.probe(request);

        assertThat(response.getPairing().isDimensionsMatch()).isTrue();
        assertThat(response.getPairing().isBitDepthMatch()).isTrue();
        assertThat(response.getPairing().getWarnings())
                .anyMatch(value -> value.contains("只核验头部几何"));
    }

    @Test
    void declaredInputSourceIsCheckedAgainstFileFacts(@TempDir final Path temp) throws Exception {
        final Path path = temp.resolve("scan.png");
        ImageIO.write(new BufferedImage(1, 1, BufferedImage.TYPE_INT_RGB), "png", path.toFile());
        final ImageProcessingConfig config = new ImageProcessingConfig();
        config.setSchemaVersion(ImageProcessingConfig.SCHEMA_VERSION_V2);
        config.setAlgorithmVersion(ImageProcessingConfig.ALGORITHM_VERSION_V2);
        config.setInputSource("linear-tiff");
        config.setFilmPolarity("positive");
        final ImageProcessingConfig.LinearInput linear = new ImageProcessingConfig.LinearInput();
        linear.setColorSpace("linear-rec2020");
        config.setLinearInput(linear);

        final ImageProbeRequest request = request(path);
        request.setImageProcessing(config);
        final ImageProbeResponse response = service.probe(request);

        assertThat(response.getDeclared().isValid()).isFalse();
        assertThat(response.getDeclared().getReason()).contains("不一致");
    }

    @Test
    void missingCorruptAndEmptyRequestsFail(@TempDir final Path temp) throws Exception {
        assertThatThrownBy(() -> service.probe(new ImageProbeRequest()))
                .isInstanceOfSatisfying(ApiException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo("IMAGE_PROBE_PATH_REQUIRED"));
        assertThatThrownBy(() -> service.probe(request(temp.resolve("missing.png"))))
                .isInstanceOfSatisfying(ApiException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo("IMAGE_PROBE_FILE_UNREADABLE"));
        final Path broken = temp.resolve("broken.png");
        Files.writeString(broken, "broken");
        assertThatThrownBy(() -> service.probe(request(broken)))
                .isInstanceOfSatisfying(ApiException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo("IMAGE_PROBE_UNSUPPORTED"));
    }

    private static ImageProbeRequest request(final Path path) {
        final ImageProbeRequest request = new ImageProbeRequest();
        request.setImagePath(path.toString());
        return request;
    }
}
