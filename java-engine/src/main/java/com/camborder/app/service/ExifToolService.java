package com.camborder.app.service;

import com.camborder.app.dto.FidelityReport;

import java.nio.file.Path;

/** 受控 ExifTool 边界；所有专业元数据读写都经过该接口。 */
public interface ExifToolService {

    boolean isAvailable();

    String version();

    Inspection inspect(Path file);

    void rewrite(Path source, Path output, String metadataPolicy, byte[] targetIcc,
                 int width, int height, int bitDepth, String colorSpace);

    /** ExifTool 读取到的独立文件事实。 */
    final class Inspection {
        private final boolean valid;
        private final int width;
        private final int height;
        private final int bitDepth;
        private final int orientation;
        private final String colorSpace;
        private final FidelityReport.IccFacts icc;
        private final FidelityReport.MetadataFacts metadata;
        private final String error;

        public Inspection(final boolean valid, final int width, final int height,
                          final int bitDepth, final int orientation, final String colorSpace,
                          final FidelityReport.IccFacts icc,
                          final FidelityReport.MetadataFacts metadata,
                          final String error) {
            this.valid = valid;
            this.width = width;
            this.height = height;
            this.bitDepth = bitDepth;
            this.orientation = orientation;
            this.colorSpace = colorSpace;
            this.icc = icc;
            this.metadata = metadata;
            this.error = error;
        }

        public boolean isValid() { return valid; }
        public int getWidth() { return width; }
        public int getHeight() { return height; }
        public int getBitDepth() { return bitDepth; }
        public int getOrientation() { return orientation; }
        public String getColorSpace() { return colorSpace; }
        public FidelityReport.IccFacts getIcc() { return icc; }
        public FidelityReport.MetadataFacts getMetadata() { return metadata; }
        public String getError() { return error; }
    }
}
