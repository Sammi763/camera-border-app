package com.camborder.app.util;

import com.camborder.app.dto.PreviewRequest;
import com.camborder.app.exception.ApiException;
import com.camborder.app.model.ImageProcessingConfig;
import com.camborder.app.model.RenderRecipe;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** T02 冻结契约：共享 JSON 用例、稳定错误码与新旧模式兼容。 */
final class ImageProcessingContractTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Path FIXTURES = Path.of("..", "fixtures", "film-digitization")
            .toAbsolutePath().normalize();

    @Test
    void legacyRequestWithoutImageProcessingStillValidates() throws Exception {
        final PreviewRequest request = readPreview("preview-legacy.json");

        assertThat(request.getRecipe().getImageProcessing()).isNull();
        assertThatCode(() -> RenderRecipeValidator.validateRecipeForProduction(request.getRecipe(), ""))
                .doesNotThrowAnyException();
    }

    @Test
    void validSensorRawConfigurationPassesStructureAndRoundTrips() throws Exception {
        final PreviewRequest request = readPreview("preview-film-valid.json");
        final RenderRecipe recipe = request.getRecipe();
        final ImageProcessingConfig processing = recipe.getImageProcessing();

        assertThat(processing).isNotNull();
        assertThat(processing.getInputMode()).isEqualTo("sensor-raw");
        assertThat(processing.getRaw().getWhiteBalance()).isEqualTo("camera");
        assertThat(processing.getRaw().isAutoBright()).isFalse();
        assertThat(processing.getNegative().getFilmBase().getRoi().getWidth()).isEqualTo(0.08);
        assertThat(processing.getPositive().getMasterCurve().getPoints()).hasSize(3);
        assertThatCode(() -> RenderRecipeValidator.validateRecipe(recipe, ""))
                .doesNotThrowAnyException();

        final String json = MAPPER.writeValueAsString(processing);
        final ImageProcessingConfig roundTripped = MAPPER.readValue(json, ImageProcessingConfig.class);
        assertThat(roundTripped.getAlgorithmVersion()).isEqualTo(ImageProcessingConfig.ALGORITHM_VERSION);
        assertThat(roundTripped.getPositive().getExposureEv()).isEqualTo(0.35);
        assertThat(roundTripped.getPositive().getMasterCurve().getPoints()).hasSize(3);
        assertThat(roundTripped.getSourceGeometry().getRotationDegrees()).isEqualTo(-1.25);
    }

    @Test
    void validLinearTiffConfigurationPassesStructure() throws Exception {
        final PreviewRequest request = readPreview("preview-film-linear-tiff.json");
        final ImageProcessingConfig processing = request.getRecipe().getImageProcessing();

        assertThat(processing.getInputMode()).isEqualTo("linear-tiff");
        assertThat(processing.getRaw()).isNull();
        assertThat(processing.getLinearInput().getColorSpace()).isEqualTo("linear-rec2020");
        assertThat(processing.getLinearInput().getBitDepth()).isEqualTo(16);
        assertThatCode(() -> RenderRecipeValidator.validateRecipe(request.getRecipe(), ""))
                .doesNotThrowAnyException();
    }

    @Test
    void validProductionRequestIsExplicitlyUnavailableUntilPipelineExists() throws Exception {
        final PreviewRequest request = readPreview("preview-film-valid.json");

        assertThatThrownBy(() -> RenderRecipeValidator.validateRecipeForProduction(request.getRecipe(), ""))
                .isInstanceOfSatisfying(ApiException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.NOT_IMPLEMENTED);
                    assertThat(exception.getCode()).isEqualTo(ImageProcessingValidator.CODE_NOT_AVAILABLE);
                });
    }

    @Test
    void invalidCasesUseStableErrorCodes() throws Exception {
        final JsonNode root = MAPPER.readTree(Files.readString(
                FIXTURES.resolve("invalid-image-processing-cases.json")));
        assertThat(root.isArray()).isTrue();
        assertThat(root.size()).isGreaterThanOrEqualTo(20);

        for (final JsonNode testCase : root) {
            final String name = testCase.path("name").asText();
            final String expectedCode = testCase.path("expectedCode").asText();
            final JsonNode processingNode = testCase.get("imageProcessing");
            assertThat(processingNode).as("case %s must contain imageProcessing", name).isNotNull();

            final ImageProcessingConfig processing = MAPPER.treeToValue(processingNode,
                    ImageProcessingConfig.class);
            assertThatThrownBy(() -> ImageProcessingValidator.validate(processing, ""))
                    .as("case %s", name)
                    .isInstanceOfSatisfying(ApiException.class, exception -> {
                        assertThat(exception.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                        assertThat(exception.getCode()).isEqualTo(expectedCode);
                    });
        }
    }

    @Test
    void nullImageProcessingIsAlwaysOrdinaryMode() {
        assertThatCode(() -> ImageProcessingValidator.validate(null, "")).doesNotThrowAnyException();
        assertThatCode(() -> ImageProcessingValidator.ensureFilmProcessingAvailable(null))
                .doesNotThrowAnyException();
    }

    @Test
    void filmOutputFieldsDefaultToOrdinaryModeAndRoundTrip() throws Exception {
        final com.camborder.app.dto.ExportSettings ordinary = new com.camborder.app.dto.ExportSettings(
                "/tmp/ordinary.jpg", "jpeg", 95);
        assertThat(ordinary.getFilmOutput()).isNull();
        assertThat(ordinary.isBorderlessMaster()).isFalse();

        ordinary.setFilmOutput("tiff16-rec2020");
        ordinary.setBorderlessMaster(true);
        final com.camborder.app.dto.ExportSettings roundTripped = MAPPER.readValue(
                MAPPER.writeValueAsString(ordinary), com.camborder.app.dto.ExportSettings.class);
        assertThat(roundTripped.getFilmOutput()).isEqualTo("tiff16-rec2020");
        assertThat(roundTripped.isBorderlessMaster()).isTrue();
    }

    private static PreviewRequest readPreview(final String fileName) throws Exception {
        return MAPPER.readValue(Files.readString(FIXTURES.resolve(fileName)), PreviewRequest.class);
    }
}
