package com.camborder.app.util;

import com.camborder.app.model.ImageProcessingConfig;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** 阶段键只随该阶段有效参数与源版本变化。 */
final class FilmStageKeysTest {

    @Test
    void rawKeyIgnoresNegativePositiveAndGeometry() {
        final ImageProcessingConfig config = FilmTestFixtures.linearProcessing();
        final String first = FilmStageKeys.rawKey(config, 100, 80, "sha256:a;size:1");
        config.setNegative(FilmTestFixtures.manualNegative(new double[]{0.5, 0.5, 0.5}));
        config.setPositive(positive(1.0));
        config.setSourceGeometry(new ImageProcessingConfig.SourceGeometry());
        config.getSourceGeometry().setRotationDegrees(12);
        final String second = FilmStageKeys.rawKey(config, 100, 80, "sha256:a;size:1");

        assertThat(second).isEqualTo(first);
        assertThat(FilmStageKeys.rawKey(config, 101, 80, "sha256:a;size:1")).isNotEqualTo(first);
        assertThat(FilmStageKeys.rawKey(config, 100, 80, "sha256:b;size:1")).isNotEqualTo(first);
        assertThat(FilmStageKeys.rawKey(config, 100, 80, "sha256:a;size:1", "helper-v1"))
                .isNotEqualTo(FilmStageKeys.rawKey(config, 100, 80, "sha256:a;size:1", "helper-v2"));
    }

    @Test
    void baseKeyChangesWithNegativeAndReferenceContentButNotPositive() {
        final ImageProcessingConfig config = FilmTestFixtures.linearProcessing();
        config.setNegative(FilmTestFixtures.manualNegative(new double[]{0.5, 0.5, 0.5}));
        config.setPositive(positive(0.5));
        final String rawKey = FilmStageKeys.rawKey(config, 10, 10, "sha256:a;size:1");
        final String first = FilmStageKeys.baseKey(rawKey, config, Map.of());

        config.setPositive(positive(2.0));
        assertThat(FilmStageKeys.baseKey(rawKey, config, Map.of())).isEqualTo(first);

        config.getNegative().getDensity().setMax(2.0);
        assertThat(FilmStageKeys.baseKey(rawKey, config, Map.of())).isNotEqualTo(first);
    }

    @Test
    void baseKeyIncludesReferenceFrameContentVersion() {
        final ImageProcessingConfig config = FilmTestFixtures.linearProcessing();
        final ImageProcessingConfig.NegativeConfig negative = FilmTestFixtures.manualNegative(
                new double[]{0.5, 0.5, 0.5});
        negative.getFilmBase().setKind("reference-frame");
        negative.getFilmBase().setReferenceImagePath("/refs/base.tif");
        negative.getFilmBase().setReferenceFingerprint("a".repeat(64));
        config.setNegative(negative);
        final String rawKey = FilmStageKeys.rawKey(config, 10, 10, "sha256:a;size:1");
        final String first = FilmStageKeys.baseKey(rawKey, config,
                Map.of("/refs/base.tif", "sha256:aaa;size:1"));
        final String second = FilmStageKeys.baseKey(rawKey, config,
                Map.of("/refs/base.tif", "sha256:bbb;size:1"));

        assertThat(second).isNotEqualTo(first);
    }

    @Test
    void currentKeyTracksOnlyPositiveAdjustments() {
        final ImageProcessingConfig config = FilmTestFixtures.linearProcessing();
        config.setNegative(FilmTestFixtures.manualNegative(new double[]{0.5, 0.5, 0.5}));
        config.setPositive(positive(0.0));
        final String rawKey = FilmStageKeys.rawKey(config, 10, 10, "sha256:a;size:1");
        final String baseKey = FilmStageKeys.baseKey(rawKey, config, Map.of());
        final String first = FilmStageKeys.currentKey(baseKey, config);

        config.getNegative().getDensity().setMax(2.0);
        assertThat(FilmStageKeys.currentKey(baseKey, config)).isEqualTo(first);
        config.setPositive(positive(1.5));
        assertThat(FilmStageKeys.currentKey(baseKey, config)).isNotEqualTo(first);
    }

    private static ImageProcessingConfig.PositiveAdjustments positive(final double exposure) {
        final ImageProcessingConfig.PositiveAdjustments positive =
                new ImageProcessingConfig.PositiveAdjustments();
        positive.setExposureEv(exposure);
        return positive;
    }
}
