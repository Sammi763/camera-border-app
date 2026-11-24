package com.camborder.app.service.impl;

import com.camborder.app.dto.ExportSettings;
import com.camborder.app.dto.RenderJobRequest;
import com.camborder.app.dto.RenderJobSnapshot;
import com.camborder.app.dto.RenderJobStatusResponse;
import com.camborder.app.dto.SourceDecode;
import com.camborder.app.model.ImagePlacement;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.repository.RenderJobStore;
import com.camborder.app.service.ImageRenderService;
import com.camborder.app.util.BorderComposer;
import com.camborder.app.util.BorderStyleRenderer;
import com.camborder.app.util.GradientPainter;
import com.camborder.app.util.ImageEncoder;
import com.camborder.app.util.ImageReader;
import com.camborder.app.util.ImageScaler;
import com.camborder.app.util.LogoRenderer;
import com.camborder.app.util.RawDecoder;
import com.camborder.app.util.TextRenderer;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 导出任务服务的并发语义测试：快照冻结、取消未执行项与逐项结果。
 * 使用受控的单线程执行器和闩锁，避免依赖真实图像处理耗时。
 */
final class DefaultRenderJobServiceTest {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @AfterEach
    void tearDown() {
        executor.shutdownNow();
    }

    @Test
    void changedFilmSourceFailsBeforeDecodingAfterQueueWait(@org.junit.jupiter.api.io.TempDir final java.nio.file.Path temp)
            throws Exception {
        final CountDownLatch release = new CountDownLatch(1);
        executor.submit(() -> { release.await(5, TimeUnit.SECONDS); return null; });
        final java.nio.file.Path source = temp.resolve("negative.tif");
        java.nio.file.Files.writeString(source, "original");
        final ImageRenderService renderer = mock(ImageRenderService.class);
        final FilmExportService film = null;
        final DefaultRenderJobService service = new DefaultRenderJobService(renderer, new RenderJobStore(),
                executor, new ObjectMapper(), film);
        final RenderRecipe recipe = com.camborder.app.util.FilmTestFixtures.recipe(source,
                com.camborder.app.util.FilmTestFixtures.linearProcessing());
        final RenderJobStatusResponse accepted = service.submitJob(new RenderJobRequest(recipe, export("/exports/test.tif")));
        java.nio.file.Files.writeString(source, "changed!");
        release.countDown();
        final RenderJobStatusResponse terminal = waitForTerminal(service, accepted.getJobId());
        assertThat(terminal.getStatus()).isEqualTo("failed");
        assertThat(terminal.getItems().get(0).getError()).contains("源文件已变化");
        org.mockito.Mockito.verifyNoInteractions(renderer);
    }

    @Test
    void fatalErrorTerminatesWholeBatchInsteadOfLeavingRunningStatus() throws Exception {
        final ImageRenderService renderer = mock(ImageRenderService.class);
        when(renderer.composeForExport(any(RenderRecipe.class), anyInt(), anyInt()))
                .thenThrow(new OutOfMemoryError("测试注入，不分配实际大数组"));
        final DefaultRenderJobService service = service(renderer);
        final RenderRecipe recipe = new RenderRecipe("/photos/test.png", null, null, null, false);
        final RenderJobStatusResponse accepted = service.submitJob(new RenderJobRequest(List.of(
                new RenderJobSnapshot(recipe, export("/exports/first.png")),
                new RenderJobSnapshot(recipe, export("/exports/second.png")))));
        final RenderJobStatusResponse terminal = waitForTerminal(service, accepted.getJobId());
        assertThat(terminal.getStatus()).isEqualTo("failed");
        assertThat(terminal.getFailed()).isEqualTo(2);
        assertThat(terminal.getItems().get(0).getError()).contains("内存不足");
        verify(renderer, times(1)).composeForExport(any(RenderRecipe.class), anyInt(), anyInt());
    }

    @Test
    void shouldFreezeRecipeAndExportSettingsAtSubmissionTime() throws Exception {
        ImageRenderService imageRenderService = mock(ImageRenderService.class);
        CountDownLatch composeStarted = new CountDownLatch(1);
        CountDownLatch continueCompose = new CountDownLatch(1);
        when(imageRenderService.composeForExport(any(RenderRecipe.class), anyInt(), anyInt())).thenAnswer(invocation -> {
            composeStarted.countDown();
            assertThat(continueCompose.await(2, TimeUnit.SECONDS)).isTrue();
            return new ImageRenderService.ComposeOutcome(
                    new BufferedImage(1, 1, BufferedImage.TYPE_INT_RGB), SourceDecode.standard("png"));
        });
        when(imageRenderService.writeToFile(any(BufferedImage.class), any(ExportSettings.class), anyString()))
                .thenReturn(exportResult("/exports/frozen.png"));

        DefaultRenderJobService service = service(imageRenderService);
        RenderRecipe recipe = new RenderRecipe("/photos/original.png", null, null, null, false);
        ExportSettings export = export("/exports/original.png");

        RenderJobStatusResponse accepted = service.submitJob(new RenderJobRequest(recipe, export));
        assertThat(composeStarted.await(2, TimeUnit.SECONDS)).isTrue();

        // 模拟 UI 在任务接受后继续编辑；正在排队的任务必须仍使用提交瞬间的内容。
        recipe.setImagePath("/photos/changed.png");
        export.setOutputPath("/exports/changed.png");
        continueCompose.countDown();

        RenderJobStatusResponse completed = waitForTerminal(service, accepted.getJobId());
        assertThat(completed.getStatus()).isEqualTo("completed");
        verify(imageRenderService).composeForExport(org.mockito.ArgumentMatchers.argThat(
                actual -> "/photos/original.png".equals(actual.getImagePath())), anyInt(), anyInt());
        verify(imageRenderService).writeToFile(any(BufferedImage.class), org.mockito.ArgumentMatchers.argThat(
                actual -> "/exports/original.png".equals(actual.getOutputPath())), anyString());
    }

    @Test
    void shouldCancelOnlyItemsThatHaveNotStarted() throws Exception {
        ImageRenderService imageRenderService = mock(ImageRenderService.class);
        CountDownLatch firstComposeStarted = new CountDownLatch(1);
        CountDownLatch releaseFirstCompose = new CountDownLatch(1);
        when(imageRenderService.composeForExport(any(RenderRecipe.class), anyInt(), anyInt())).thenAnswer(invocation -> {
            firstComposeStarted.countDown();
            assertThat(releaseFirstCompose.await(2, TimeUnit.SECONDS)).isTrue();
            return new ImageRenderService.ComposeOutcome(
                    new BufferedImage(1, 1, BufferedImage.TYPE_INT_RGB), SourceDecode.standard("png"));
        });
        when(imageRenderService.writeToFile(any(BufferedImage.class), any(ExportSettings.class), anyString()))
                .thenReturn(exportResult("/exports/first.png"));

        DefaultRenderJobService service = service(imageRenderService);
        RenderJobRequest request = new RenderJobRequest(List.of(
                new RenderJobSnapshot(new RenderRecipe("/photos/first.png", null, null, null, false), export("/exports/first.png")),
                new RenderJobSnapshot(new RenderRecipe("/photos/second.png", null, null, null, false), export("/exports/second.png"))
        ));

        RenderJobStatusResponse accepted = service.submitJob(request);
        assertThat(firstComposeStarted.await(2, TimeUnit.SECONDS)).isTrue();
        RenderJobStatusResponse cancelled = service.cancelJob(accepted.getJobId());
        assertThat(cancelled.getItems().get(1).getStatus()).isEqualTo("cancelled");

        releaseFirstCompose.countDown();
        RenderJobStatusResponse terminal = waitForTerminal(service, accepted.getJobId());
        assertThat(terminal.getStatus()).isEqualTo("cancelled");
        assertThat(terminal.getCompleted()).isEqualTo(1);
        assertThat(terminal.getCancelled()).isEqualTo(1);
        assertThat(terminal.getItems().get(0).getStatus()).isEqualTo("completed");
        assertThat(terminal.getItems().get(1).getError()).isEqualTo("任务已取消，未执行");
        verify(imageRenderService, times(1)).composeForExport(any(RenderRecipe.class), anyInt(), anyInt());
    }

    @Test
    void exportsCroppedJpegAtRequestedSizeWithTheSelectedFocalPoint(@TempDir final Path temp) throws Exception {
        final Path source = temp.resolve("source.jpg");
        final Path target = temp.resolve("crop.png");
        final BufferedImage original = new BufferedImage(600, 300, BufferedImage.TYPE_INT_RGB);
        final Graphics2D graphics = original.createGraphics();
        try {
            graphics.setColor(Color.RED);
            graphics.fillRect(0, 0, 200, 300);
            graphics.setColor(Color.GREEN);
            graphics.fillRect(200, 0, 200, 300);
            graphics.setColor(Color.BLUE);
            graphics.fillRect(400, 0, 200, 300);
        } finally {
            graphics.dispose();
        }
        assertThat(ImageIO.write(original, "jpeg", source.toFile())).isTrue();
        final RenderRecipe recipe = new RenderRecipe(source.toString(), null, null, null, false);
        recipe.setImagePlacement(new ImagePlacement("fill", 1, 0.5, 0, 1.0));
        final ExportSettings export = export(target.toString());
        export.setMaxWidth(204);
        export.setMaxHeight(204);
        final DefaultRenderJobService service = service(new Java2DImageRenderService(
                new ImageReader(new RawDecoder()), new ImageScaler(), new BorderComposer(new GradientPainter()),
                new BorderStyleRenderer(), new TextRenderer(), new ImageEncoder(), new LogoRenderer()));

        final RenderJobStatusResponse accepted = service.submitJob(new RenderJobRequest(recipe, export));

        assertThat(waitForTerminal(service, accepted.getJobId()).getStatus()).isEqualTo("completed");
        final BufferedImage output = ImageIO.read(target.toFile());
        assertThat(output.getWidth()).isEqualTo(204);
        assertThat(output.getHeight()).isEqualTo(204);
        assertThat(new Color(output.getRGB(20, 102)).getGreen()).isGreaterThan(240);
        assertThat(new Color(output.getRGB(180, 102)).getBlue()).isGreaterThan(240);
    }

    private DefaultRenderJobService service(final ImageRenderService imageRenderService) {
        return new DefaultRenderJobService(
                imageRenderService,
                new RenderJobStore(),
                executor,
                new ObjectMapper()
        );
    }

    private static ExportSettings export(final String outputPath) {
        return new ExportSettings(outputPath, "png", 95);
    }

    private static ImageEncoder.ExportResult exportResult(final String outputPath) {
        ImageEncoder.FeatureResult notRequested = new ImageEncoder.FeatureResult(
                ImageEncoder.FeatureStatus.NOT_REQUESTED, null);
        return new ImageEncoder.ExportResult(outputPath, "png", notRequested, notRequested, notRequested);
    }

    private static RenderJobStatusResponse waitForTerminal(final DefaultRenderJobService service, final String jobId)
            throws InterruptedException {
        for (int attempt = 0; attempt < 100; attempt++) {
            RenderJobStatusResponse status = service.getJobStatus(jobId);
            if ("completed".equals(status.getStatus())
                    || "failed".equals(status.getStatus())
                    || "cancelled".equals(status.getStatus())) {
                return status;
            }
            Thread.sleep(10L);
        }
        throw new AssertionError("render job did not reach a terminal state");
    }
}
