package com.camborder.app.service.impl;

import com.camborder.app.dto.FidelityReport;
import com.camborder.app.dto.PreviewRequest;
import com.camborder.app.dto.PreviewResponse;
import com.camborder.app.dto.SourceDecode;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.repository.PreviewStore;
import com.camborder.app.service.ImageRenderService;
import com.camborder.app.util.SourceImageInfo;
import org.junit.jupiter.api.Test;

import java.awt.image.BufferedImage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 预览必须如实标记 RAW 内嵌 JPEG 的受限像素来源，不能报告为完整传感器保真。 */
final class LocalPreviewServiceImplTest {

    @Test
    void embeddedJpegPreviewReportsLimitedFidelity() {
        ImageRenderService imageRenderService = mock(ImageRenderService.class);
        BufferedImage image = new BufferedImage(16, 12, BufferedImage.TYPE_INT_RGB);
        SourceImageInfo sourceInfo = new SourceImageInfo(
                "embedded-jpeg", "/tmp/embedded-preview.nef", 16, 12, 8,
                "sRGB-assumed", 1, null, new FidelityReport.MetadataFacts());
        when(imageRenderService.compose(any(RenderRecipe.class), anyInt(), anyInt()))
                .thenReturn(new ImageRenderService.ComposeOutcome(
                        image, SourceDecode.embeddedJpeg("nef"), sourceInfo));
        when(imageRenderService.toPng(image)).thenReturn(new byte[]{1, 2, 3});

        PreviewResponse response = new LocalPreviewServiceImpl(imageRenderService, new PreviewStore(2))
                .generatePreview(new PreviewRequest(new RenderRecipe(), 320, 240));

        assertThat(response.getSourceDecode().getMode())
                .isEqualTo(SourceDecode.MODE_EMBEDDED_JPEG);
        assertThat(response.getFidelityReport().getPixelSource())
                .isEqualTo("embedded-jpeg");
        assertThat(response.getFidelityReport().getFidelityScope())
                .isEqualTo("limited");
        assertThat(response.getFidelityReport().getWarnings())
                .contains("RAW 仅使用内嵌 JPEG 像素");
        assertThat(response.getFidelityReport().getSource().getWidth()).isEqualTo(16);
        assertThat(response.getFidelityReport().getSource().getHeight()).isEqualTo(12);
    }
}
