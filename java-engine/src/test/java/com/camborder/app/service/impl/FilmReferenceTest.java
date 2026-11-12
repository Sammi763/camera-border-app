package com.camborder.app.service.impl;
import com.camborder.app.model.*;
import com.camborder.app.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import static org.assertj.core.api.Assertions.*;

final class FilmReferenceTest {
    private final FilmProcessingPipeline pipeline = new FilmProcessingPipeline(new FilmRawDecoder("",new ObjectMapper()), new ObjectMapper());
    @Test void sameRollReferenceResolvesWithFingerprintAndRejectsChangedReference(@TempDir Path temp) throws Exception {
        final Path currentDir=Files.createDirectory(temp.resolve("current"));
        final Path refDir=Files.createDirectory(temp.resolve("ref"));
        final Path image=FilmTestFixtures.writeLinearTiff(currentDir,1,1,new int[]{10000,10000,10000});
        final Path reference=FilmTestFixtures.writeLinearTiff(refDir,1,1,new int[]{20000,20000,20000});
        final ImageProcessingConfig config=FilmTestFixtures.linearProcessing();
        config.setNegative(FilmTestFixtures.manualNegative(new double[]{1,1,1}));
        final ImageProcessingConfig.FilmBaseConfig base=config.getNegative().getFilmBase();
        base.setKind("reference-frame"); base.setReferenceImagePath(reference.toString());
        final byte[] hash=java.security.MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(reference));
        final StringBuilder hex=new StringBuilder(); for(byte b:hash)hex.append(String.format("%02x",b));
        base.setReferenceFingerprint(hex.toString());
        final RenderRecipe recipe=FilmTestFixtures.recipe(image,config);
        assertThat(pipeline.process(recipe,"base-positive").getImage().get(0,0,0)).isCloseTo((float)Math.log10(2),within(1e-5f));
        Files.write(reference,new byte[]{1,2,3});
        assertThatThrownBy(()->pipeline.process(recipe,"base-positive")).hasMessageContaining("参考帧");
    }
    @Test void lightReferenceProducesPinnedChannelGain(@TempDir Path temp) throws Exception {
        final Path current = FilmTestFixtures.writeLinearTiff(Files.createDirectory(temp.resolve("photo")),1,1,new int[]{10000,10000,10000});
        final Path reference = FilmTestFixtures.writeLinearTiff(Files.createDirectory(temp.resolve("light")),1,1,new int[]{20000,40000,10000});
        final ImageProcessingConfig config = FilmTestFixtures.linearProcessing(); config.setNegative(FilmTestFixtures.manualNegative(new double[]{1,1,1}));
        final ImageProcessingConfig.LightSourceConfig light = config.getNegative().getLightSource();
        light.setReferenceImagePath(reference.toString());
        final StringBuilder hash = new StringBuilder();
        for (byte value : java.security.MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(reference))) hash.append(String.format("%02x",value));
        light.setReferenceFingerprint(hash.toString());
        final FilmProcessingPipeline.Processed processed = pipeline.process(FilmTestFixtures.recipe(current,config),"base-positive");
        assertThat(processed.getResolvedLightGain()).containsExactly(2,1,4);
        assertThat(processed.getImage().get(0,0,0)).isCloseTo((float)Math.log10(65535.0/20000),within(1e-5f));
    }

    @Test void calibrationCannotCrossInputSpaces(@TempDir Path temp) throws Exception {
        final Path image=FilmTestFixtures.writeLinearTiff(temp,1,1,new int[]{10000,10000,10000});
        final ImageProcessingConfig config=FilmTestFixtures.linearProcessing(); config.setNegative(FilmTestFixtures.manualNegative(new double[]{1,1,1}));
        config.getNegative().setCalibrationSpaceKey("another-camera");
        assertThatThrownBy(()->pipeline.process(FilmTestFixtures.recipe(image,config),"current-positive"))
                .hasMessageContaining("不匹配");
    }
}
