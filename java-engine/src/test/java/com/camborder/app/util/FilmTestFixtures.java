package com.camborder.app.util;

import com.camborder.app.dto.ExportSettings;
import com.camborder.app.model.ImageProcessingConfig;
import com.camborder.app.model.RenderRecipe;

import javax.imageio.ImageIO;
import java.awt.color.ColorSpace;
import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;

/** T05–T07 测试共用的小型线性 TIFF / 配方构造器。 */
public final class FilmTestFixtures {

    private FilmTestFixtures() { }

    public static Path writeLinearTiff(final Path directory, final int width, final int height,
                                       final int[] samples) throws Exception {
        final BufferedImage image = PixelBufferFactory.create(width, height, 16, false,
                ColorSpace.getInstance(ColorSpace.CS_sRGB));
        int index = 0;
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                for (int channel = 0; channel < 3; channel++) {
                    image.getRaster().setSample(x, y, channel, samples[index++]);
                }
            }
        }
        final Path path = directory.resolve("film-fixture.tif");
        new ImageEncoder().writeToFile(image, path.toString(),
                new ExportSettings(path.toString(), "tiff", 95));
        if (!Files.isRegularFile(path)) throw new IllegalStateException("fixture TIFF not written");
        return path;
    }

    public static ImageProcessingConfig linearProcessing() {
        final ImageProcessingConfig config = new ImageProcessingConfig();
        config.setInputMode("linear-tiff");
        final ImageProcessingConfig.LinearInput linear = new ImageProcessingConfig.LinearInput();
        linear.setTransferFunction("linear");
        linear.setColorSpace("linear-rec2020");
        linear.setBitDepth(16);
        config.setLinearInput(linear);
        return config;
    }

    public static ImageProcessingConfig.NegativeConfig manualNegative(final double[] base) {
        final ImageProcessingConfig.NegativeConfig negative = new ImageProcessingConfig.NegativeConfig();
        negative.setEnabled(true);
        negative.setProfile("generic-color-negative-v1");
        final ImageProcessingConfig.LightSourceConfig light =
                new ImageProcessingConfig.LightSourceConfig();
        light.setKind("camera-white-balance");
        negative.setLightSource(light);
        final ImageProcessingConfig.FilmBaseConfig filmBase =
                new ImageProcessingConfig.FilmBaseConfig();
        filmBase.setKind("manual");
        filmBase.setStage("linear-working");
        filmBase.setRgb(base);
        negative.setFilmBase(filmBase);
        final ImageProcessingConfig.DensityConfig density = new ImageProcessingConfig.DensityConfig();
        density.setMin(0);
        density.setMax(1);
        negative.setDensity(density);
        return negative;
    }

    public static RenderRecipe recipe(final Path path, final ImageProcessingConfig processing) {
        final RenderRecipe recipe = new RenderRecipe(path.toString(), null, null, null, false);
        recipe.setImageProcessing(processing);
        return recipe;
    }

    public static int[] constantSamples(final int pixels, final int[] rgb) {
        final int[] values = new int[pixels * 3];
        for (int index = 0; index < pixels; index++) {
            values[index * 3] = rgb[0];
            values[index * 3 + 1] = rgb[1];
            values[index * 3 + 2] = rgb[2];
        }
        return values;
    }
}
