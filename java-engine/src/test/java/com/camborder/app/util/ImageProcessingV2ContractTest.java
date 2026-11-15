package com.camborder.app.util;

import com.camborder.app.exception.ApiException;
import com.camborder.app.model.ImageProcessingConfig;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** v2 胶片校色契约：输入来源与正负性质分离、正片跳过反相、v1 继续兼容。 */
final class ImageProcessingV2ContractTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final java.nio.file.Path FIXTURES = java.nio.file.Path.of(
            "..", "fixtures", "film-digitization").toAbsolutePath().normalize();

    @Test
    void positiveScannedRasterIsValidAndRoundTrips() throws Exception {
        final ImageProcessingConfig config = MAPPER.readValue(positiveJson(), ImageProcessingConfig.class);

        assertThatCode(() -> ImageProcessingValidator.validate(config, "")).doesNotThrowAnyException();
        assertThat(config.getInputSource()).isEqualTo("encoded-raster");
        assertThat(config.getFilmPolarity()).isEqualTo("positive");
        assertThat(config.getNegative()).isNull();

        final ImageProcessingConfig roundTripped = MAPPER.readValue(
                MAPPER.writeValueAsString(config), ImageProcessingConfig.class);
        assertThat(roundTripped.getAlgorithmVersion())
                .isEqualTo(ImageProcessingConfig.ALGORITHM_VERSION_V2);
        assertThat(roundTripped.getEncodedInput().getColorSpace()).isEqualTo("srgb");
        assertThat(roundTripped.getPositive().getExposureEv()).isEqualTo(0.25);
    }

    @Test
    void colorNegativeRequiresCompleteNegativeConfig() throws Exception {
        final ImageProcessingConfig missing = MAPPER.readValue(positiveJson(), ImageProcessingConfig.class);
        missing.setFilmPolarity("color-negative");
        assertCode(missing, ImageProcessingValidator.CODE_INVALID_NEGATIVE);

        final ImageProcessingConfig complete = MAPPER.readValue(positiveJson(), ImageProcessingConfig.class);
        complete.setFilmPolarity("color-negative");
        complete.setNegative(FilmTestFixtures.manualNegative(new double[]{0.8, 0.6, 0.4}));
        assertThatCode(() -> ImageProcessingValidator.validate(complete, "")).doesNotThrowAnyException();
    }

    @Test
    void positiveMustNotEnableNegativeInversion() throws Exception {
        final ImageProcessingConfig config = MAPPER.readValue(positiveJson(), ImageProcessingConfig.class);
        config.setNegative(FilmTestFixtures.manualNegative(new double[]{0.8, 0.6, 0.4}));
        assertCode(config, ImageProcessingValidator.CODE_INVALID_NEGATIVE);
    }

    @Test
    void versionAndSourceCombinationsAreRejectedWithStableCodes() throws Exception {
        final ImageProcessingConfig wrongAlgorithm = MAPPER.readValue(positiveJson(),
                ImageProcessingConfig.class);
        wrongAlgorithm.setAlgorithmVersion("film-digitization-v1");
        assertCode(wrongAlgorithm, ImageProcessingValidator.CODE_UNSUPPORTED_ALGORITHM);

        final ImageProcessingConfig source = MAPPER.readValue(positiveJson(),
                ImageProcessingConfig.class);
        source.setInputSource("camera-negative");
        assertCode(source, ImageProcessingValidator.CODE_INVALID_INPUT_SOURCE);

        final ImageProcessingConfig polarity = MAPPER.readValue(positiveJson(),
                ImageProcessingConfig.class);
        polarity.setFilmPolarity("negative");
        assertCode(polarity, ImageProcessingValidator.CODE_INVALID_POLARITY);

        final ImageProcessingConfig oldMode = MAPPER.readValue(positiveJson(),
                ImageProcessingConfig.class);
        oldMode.setInputMode("sensor-raw");
        assertCode(oldMode, ImageProcessingValidator.CODE_INVALID_INPUT_MODE);
    }

    @Test
    void encodedInputRequiresExplicitColorDefinition() throws Exception {
        final ImageProcessingConfig missing = MAPPER.readValue(positiveJson(),
                ImageProcessingConfig.class);
        missing.setEncodedInput(new ImageProcessingConfig.EncodedInput());
        assertCode(missing, ImageProcessingValidator.CODE_INVALID_ENCODED_INPUT);

        final ImageProcessingConfig embeddedWithoutHash = MAPPER.readValue(positiveJson(),
                ImageProcessingConfig.class);
        embeddedWithoutHash.getEncodedInput().setColorSpace("embedded");
        embeddedWithoutHash.getEncodedInput().setIccSha256(null);
        assertCode(embeddedWithoutHash, ImageProcessingValidator.CODE_INVALID_ENCODED_INPUT);

        final ImageProcessingConfig badDepth = MAPPER.readValue(positiveJson(),
                ImageProcessingConfig.class);
        badDepth.getEncodedInput().setBitDepth(12);
        assertCode(badDepth, ImageProcessingValidator.CODE_INVALID_ENCODED_INPUT);
    }

    @Test
    void flextightInputUsesExplicitLinearScanDomain() throws Exception {
        final ImageProcessingConfig config = MAPPER.readValue(positiveJson(),
                ImageProcessingConfig.class);
        config.setInputSource("flextight-fff");
        config.setEncodedInput(null);
        final ImageProcessingConfig.FlextightInput fff = new ImageProcessingConfig.FlextightInput();
        fff.setColorSpace("linear-rec2020");
        config.setFlextightInput(fff);
        assertThatCode(() -> ImageProcessingValidator.validate(config, "")).doesNotThrowAnyException();

        fff.setColorSpace("adobe-rgb");
        assertCode(config, ImageProcessingValidator.CODE_INVALID_FLEXTIGHT_INPUT);
        fff.setColorSpace("linear-srgb");
        fff.setBitDepth(8);
        assertCode(config, ImageProcessingValidator.CODE_INVALID_FLEXTIGHT_INPUT);
    }

    @Test
    void sharedV2PositiveFixtureIsValid() throws Exception {
        final ImageProcessingConfig config = MAPPER.readValue(
                Files.readString(FIXTURES.resolve("image-processing-v2-positive.json")),
                ImageProcessingConfig.class);
        assertThatCode(() -> ImageProcessingValidator.validate(config, "")).doesNotThrowAnyException();
        assertThat(config.getEncodedInput().getColorSpace()).isEqualTo("embedded");
        assertThat(config.getNegative()).isNull();
        assertThatCode(() -> ImageProcessingValidator.ensureFilmProcessingAvailable(config))
                .doesNotThrowAnyException();
    }

    @Test
    void v1RequestsRemainAccepted() {
        final ImageProcessingConfig legacy = new ImageProcessingConfig();
        legacy.setInputMode("sensor-raw");
        final ImageProcessingConfig.RawOptions raw = new ImageProcessingConfig.RawOptions();
        legacy.setRaw(raw);
        assertThatCode(() -> ImageProcessingValidator.validate(legacy, "")).doesNotThrowAnyException();
    }

    private static void assertCode(final ImageProcessingConfig config, final String code) {
        assertThatThrownBy(() -> ImageProcessingValidator.validate(config, ""))
                .isInstanceOfSatisfying(ApiException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(exception.getCode()).isEqualTo(code);
                });
    }

    private static String positiveJson() {
        return "{"
                + "\"schemaVersion\":2,"
                + "\"algorithmVersion\":\"film-color-v2\","
                + "\"inputSource\":\"encoded-raster\","
                + "\"filmPolarity\":\"positive\","
                + "\"encodedInput\":{\"colorSpace\":\"srgb\",\"bitDepth\":8,\"alphaBackground\":\"white\"},"
                + "\"positive\":{\"exposureEv\":0.25,\"rgbBalanceEv\":[0,0,0],"
                + "\"blackPoint\":0,\"whitePoint\":1,\"saturation\":1},"
                + "\"sourceGeometry\":{\"crop\":{\"x\":0,\"y\":0,\"width\":1,\"height\":1},"
                + "\"rotationDegrees\":0}"
                + "}";
    }
}
