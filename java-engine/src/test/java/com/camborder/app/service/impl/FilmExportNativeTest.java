package com.camborder.app.service.impl;
import com.camborder.app.dto.ExportSettings;
import com.camborder.app.model.*;
import com.camborder.app.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.util.concurrent.TimeUnit;
import static org.assertj.core.api.Assertions.*;

/** 本地受控 ExifTool 的独立文件验证；缺少组件时明确跳过，普通编码单测仍运行。 */
final class FilmExportNativeTest {
    @Test void actualArwCompletesProcessingAndMetadataExport(@TempDir Path temp) throws Exception {
        final Path image = Path.of("../photos/DSC04881.ARW").toAbsolutePath().normalize();
        final Path helper = Path.of("../professional-tools/libraw/macos-arm64/film-raw-helper").toAbsolutePath().normalize();
        final ControlledExifToolService exif = new ControlledExifToolService(Path.of("../professional-tools/exiftool/macos/exiftool").toAbsolutePath().normalize().toString(),10000,new ObjectMapper());
        Assumptions.assumeTrue(Files.isRegularFile(image) && Files.isExecutable(helper) && exif.isAvailable(),"本机真实 RAW/受控工具不可用");
        final ImageProcessingConfig config = FilmTestFixtures.linearProcessing();
        config.setInputMode("sensor-raw"); config.setLinearInput(null); config.setRaw(new ImageProcessingConfig.RawOptions());
        config.setNegative(FilmTestFixtures.manualNegative(new double[]{1,1,1}));
        final RenderRecipe recipe = FilmTestFixtures.recipe(image,config);
        final FilmExportService service = new FilmExportService(new FilmProcessingPipeline(new FilmRawDecoder(helper.toString(),new ObjectMapper()),new ObjectMapper()),
                new ImageEncoder(exif), new FilmCompositor(new BorderStyleRenderer(),new TextRenderer(),new LogoRenderer(),new GradientPainter()));
        final ExportSettings settings = new ExportSettings(temp.resolve("actual-raw.tif").toString(),"tiff",95);
        settings.setTier("custom"); settings.setFilmOutput("tiff16-rec2020"); settings.setMetadataPolicy("preserve");
        settings.setMaxWidth(128); settings.setMaxHeight(128);
        final FilmExportService.Result result = service.export(recipe,settings);
        assertThat(result.getSourceDecode().getSensorBitDepth()).isEqualTo(14);
        assertThat(result.getSourceDecode().getFullWidth()).isEqualTo(4672);
        final com.camborder.app.service.ExifToolService.Inspection output = exif.inspect(Path.of(settings.getOutputPath()));
        assertThat(output.isValid()).isTrue(); assertThat(output.getWidth()).isEqualTo(85);
        assertThat(output.getHeight()).isEqualTo(128); assertThat(output.getOrientation()).isEqualTo(1);
        assertThat(output.getBitDepth()).isEqualTo(16); assertThat(output.getMetadata().isExif()).isTrue();
        assertThat(result.getExportResult().getFidelityReport().isVerified()).isTrue();
    }

    @Test void realToolConfirmsWideGamutProfileMetadataAndLowBits(@TempDir Path temp) throws Exception {
        final Path tool=Path.of("../professional-tools/exiftool/macos/exiftool").toAbsolutePath().normalize();
        final ControlledExifToolService exif=new ControlledExifToolService(tool.toString(),10000,new ObjectMapper());
        Assumptions.assumeTrue(exif.isAvailable(),"本机受控 ExifTool 不可用");
        final Path image=FilmTestFixtures.writeLinearTiff(temp,8,2,FilmTestFixtures.constantSamples(16,new int[]{16000,20000,24000}));
        final Process tags=new ProcessBuilder(tool.toString(),"-overwrite_original","-Make=FilmTestCamera","-XMP:Title=FilmTest",image.toString()).redirectErrorStream(true).start();
        assertThat(tags.waitFor(10,TimeUnit.SECONDS)).isTrue(); assertThat(tags.exitValue()).isZero();
        final ImageProcessingConfig config=FilmTestFixtures.linearProcessing(); config.setNegative(FilmTestFixtures.manualNegative(new double[]{1,1,1}));
        final RenderRecipe recipe=FilmTestFixtures.recipe(image,config); recipe.setBorder(new BorderConfig(2,2,2,2,"#fff"));
        final FilmExportService service=new FilmExportService(new FilmProcessingPipeline(new FilmRawDecoder("",new ObjectMapper()),new ObjectMapper()),
                new ImageEncoder(exif),new FilmCompositor(new BorderStyleRenderer(),new TextRenderer(),new LogoRenderer(),new GradientPainter()));
        for(String combination:new String[]{"tiff16-srgb","tiff16-rec2020","srgb-jpeg"}) {
            final Path output=temp.resolve(combination+(combination.equals("srgb-jpeg")?".jpg":".tif"));
            final ExportSettings settings=new ExportSettings(output.toString(),combination.equals("srgb-jpeg")?"jpeg":"tiff",95);
            settings.setFilmOutput(combination); settings.setTier("custom"); settings.setMetadataPolicy("preserve");
            final FilmExportService.Result result=service.export(recipe,settings);
            final com.camborder.app.service.ExifToolService.Inspection actual=exif.inspect(output);
            assertThat(actual.getWidth()).isEqualTo(12); assertThat(actual.getHeight()).isEqualTo(6);
            assertThat(actual.getBitDepth()).isEqualTo(combination.equals("srgb-jpeg")?8:16);
            assertThat(actual.getMetadata().isXmp()).isTrue(); assertThat(actual.getMetadata().isExif()).isTrue();
            assertThat(result.getExportResult().getFidelityReport().isVerified()).isTrue();
            if (!combination.equals("srgb-jpeg")) {
                // 独立读取 TIFF 标签表，防止元数据写回把 RGB 三通道位深变成单值。
                final byte[] bytes = Files.readAllBytes(output);
                final java.nio.ByteBuffer tiff = java.nio.ByteBuffer.wrap(bytes).order(
                        bytes[0] == 'I' ? java.nio.ByteOrder.LITTLE_ENDIAN : java.nio.ByteOrder.BIG_ENDIAN);
                final int ifd = tiff.getInt(4), entries = Short.toUnsignedInt(tiff.getShort(ifd));
                boolean found = false;
                for (int i = 0; i < entries; i++) {
                    final int entry = ifd + 2 + i * 12;
                    if (Short.toUnsignedInt(tiff.getShort(entry)) == 258) {
                        assertThat(tiff.getInt(entry + 4)).isEqualTo(3);
                        found = true;
                    }
                }
                assertThat(found).isTrue();
            }
            if(combination.equals("tiff16-rec2020")) {
                final java.awt.color.ICC_ProfileRGB profile=(java.awt.color.ICC_ProfileRGB)java.awt.color.ICC_Profile.getInstance(ImageMetadataPayload.read(output.toString()).getIcc());
                assertThat(profile.getGamma(0)).isEqualTo(1);
            }
        }
    }
}
