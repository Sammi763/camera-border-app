package com.camborder.app.util;

import com.camborder.app.model.ImageProcessingConfig;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/** 本机私有真实样片探针；不将照片或绝对路径写入仓库，不等同于扫描输入域校准。 */
@EnabledIfEnvironmentVariable(named = "FILM_REVIEW_FFF_ROOT", matches = ".+")
final class FilmFlextightLocalTest {
    @Test
    void probesRealFilesAndExportsLargestAtFullSize(@TempDir final Path output) throws Exception {
        final List<Path> paths;
        try (java.util.stream.Stream<Path> files = Files.walk(Path.of(System.getenv("FILM_REVIEW_FFF_ROOT")))) {
            paths = files.filter(p -> p.toString().toLowerCase(java.util.Locale.ROOT).endsWith(".fff"))
                    .sorted().collect(Collectors.toList());
        }
        assertThat(paths).isNotEmpty();
        final FilmFlextightReader reader = new FilmFlextightReader();
        Path largest = null;
        long pixels = 0;
        for (Path path : paths) {
            final FilmFlextightReader.ProbeResult probe = reader.probe(path);
            assertThat(probe.getBitDepth()).isEqualTo(16);
            assertThat(probe.getImageCount()).isGreaterThan(1);
            final long size = (long) probe.getWidth() * probe.getHeight();
            if (size > pixels) { largest = path; pixels = size; }
        }
        final ImageProcessingConfig.FlextightInput input = new ImageProcessingConfig.FlextightInput();
        input.setColorSpace("linear-rec2020");
        // 显式假设仅用于读写数值链路；不据此认定真实扫描数据的色彩空间/传递函数。
        final FilmFlextightReader.ReadResult read = reader.read(largest.toString(), input);
        final FloatRgbImage image = read.getImage();
        assertThat((long) image.getWidth() * image.getHeight()).isEqualTo(pixels);
        final Path target = output.resolve("full-size.tif");
        new ImageEncoder().writeFilmTiff(FloatImageOps.toBufferedImage16(image), target.toString(),
                java.awt.color.ICC_Profile.getInstance(java.awt.color.ColorSpace.CS_sRGB).getData());
        final FilmEncodedRasterReader.ProbeResult probe = new FilmEncodedRasterReader().probe(target);
        assertThat(probe.getWidth()).isEqualTo(image.getWidth());
        assertThat(probe.getHeight()).isEqualTo(image.getHeight());
        assertThat(probe.getBitDepth()).isEqualTo(16);
        System.out.println("真实 FFF 数值读写：files=" + paths.size() + ", pixels=" + pixels
                + ", output=" + probe.getWidth() + "x" + probe.getHeight() + ", bits=16");
    }
}
