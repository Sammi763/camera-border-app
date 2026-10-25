package com.camborder.app.service.impl;

import com.camborder.app.dto.PhotoMetadataResponse;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 用版本化真实样片验收引擎的 JPEG/TIFF EXIF 读取，不用测试对象或手写元数据替代文件。
 */
final class Stage4FixtureMetadataTest {

    private final ExifMetadataServiceImpl service = new ExifMetadataServiceImpl();

    @Test
    void readsAllRequiredExifVariablesFromRealJpeg() {
        PhotoMetadataResponse metadata = service.readMetadata(fixture("real-exif-canon-m03a9518.jpg"));

        assertThat(metadata.getCameraModel()).contains("Canon", "5D Mark IV");
        assertThat(metadata.getLensModel()).contains("EF24-70mm f/2.8L II USM");
        assertThat(metadata.getFNumber()).isEqualTo("f/11");
        assertThat(metadata.getExposureTime()).isEqualTo("1/125 s");
        assertThat(metadata.getIso()).isEqualTo("200");
        assertThat(metadata.getFocalLength()).isEqualTo("31 mm");
        assertThat(metadata.getDateTimeOriginal()).isEqualTo("2017:05:11 15:52:33");
        assertThat(metadata.getMake()).isEqualTo("Canon");
        assertThat(metadata.getModel()).contains("5D Mark IV");
    }

    @Test
    void readsRealTiffCameraAndDateMetadata() {
        PhotoMetadataResponse metadata = service.readMetadata(fixture("real-exif-canon-farmers-nooning.tif"));

        assertThat(metadata.getCameraModel()).contains("Canon", "1Ds Mark II");
        assertThat(metadata.getDateTimeOriginal()).isEqualTo("2006:12:05 03:45:51");
        assertThat(metadata.getMake()).isEqualTo("Canon");
        assertThat(metadata.getModel()).contains("1Ds Mark II");
    }

    private static String fixture(String name) {
        return Path.of("..", "fixtures", "stage4", name).toAbsolutePath().normalize().toString();
    }
}
