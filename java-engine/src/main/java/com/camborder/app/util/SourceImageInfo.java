package com.camborder.app.util;

import com.camborder.app.dto.FidelityReport;
import com.camborder.app.dto.SourceDecode;

import java.awt.color.ICC_ColorSpace;
import java.awt.color.ICC_Profile;
import java.awt.image.BufferedImage;
import java.nio.file.Path;
import java.security.MessageDigest;

/** 解码阶段冻结的源图事实；预览、预检和导出共用这份信息。 */
public final class SourceImageInfo {

    private final String pixelSource;
    private final String metadataSource;
    private final int width;
    private final int height;
    private final int decodedWidth;
    private final int decodedHeight;
    private final int orientedWidth;
    private final int orientedHeight;
    private final int bitDepth;
    private final String colorSpace;
    private final int orientation;
    private final byte[] icc;
    private final FidelityReport.MetadataFacts metadata;

    public SourceImageInfo(final String pixelSource, final String metadataSource,
                           final int width, final int height, final int bitDepth,
                           final String colorSpace, final int orientation,
                           final byte[] icc, final FidelityReport.MetadataFacts metadata) {
        this(pixelSource, metadataSource, width, height, width, height, width, height,
                bitDepth, colorSpace, orientation, icc, metadata);
    }

    public SourceImageInfo(final String pixelSource, final String metadataSource,
                           final int width, final int height,
                           final int decodedWidth, final int decodedHeight,
                           final int orientedWidth, final int orientedHeight,
                           final int bitDepth, final String colorSpace, final int orientation,
                           final byte[] icc, final FidelityReport.MetadataFacts metadata) {
        this.pixelSource = pixelSource;
        this.metadataSource = metadataSource;
        this.width = width;
        this.height = height;
        this.decodedWidth = decodedWidth;
        this.decodedHeight = decodedHeight;
        this.orientedWidth = orientedWidth;
        this.orientedHeight = orientedHeight;
        this.bitDepth = bitDepth;
        this.colorSpace = colorSpace;
        this.orientation = orientation;
        this.icc = icc == null ? null : icc.clone();
        this.metadata = metadata;
    }

    public static SourceImageInfo from(final BufferedImage image, final String imagePath,
                                       final SourceDecode decode,
                                       final com.camborder.app.service.ExifToolService exifToolService) {
        return from(image, imagePath, decode, exifToolService,
                image.getWidth(), image.getHeight(), image.getWidth(), image.getHeight(), 1);
    }

    public static SourceImageInfo from(final BufferedImage image, final String imagePath,
                                       final SourceDecode decode,
                                       final com.camborder.app.service.ExifToolService exifToolService,
                                       final int decodedWidth, final int decodedHeight,
                                       final int orientedWidth, final int orientedHeight,
                                       final int decodedOrientation) {
        final ImageMetadataPayload payload = ImageMetadataPayload.read(imagePath);
        int orientation = ImageOrientation.normalize(decodedOrientation);
        FidelityReport.MetadataFacts metadata = emptyMetadata();
        if (exifToolService != null && exifToolService.isAvailable()) {
            final com.camborder.app.service.ExifToolService.Inspection inspection =
                    exifToolService.inspect(Path.of(imagePath));
            if (inspection.isValid()) {
                metadata = inspection.getMetadata() == null ? emptyMetadata() : inspection.getMetadata();
            }
        }
        final String pixelSource = SourceDecode.MODE_EMBEDDED_JPEG.equals(decode.getMode())
                ? "embedded-jpeg" : "decoded-file";
        final String colorSpace = payload.hasIcc() ? "icc" : "sRGB-assumed";
        return new SourceImageInfo(pixelSource, imagePath, image.getWidth(), image.getHeight(),
                decodedWidth, decodedHeight, orientedWidth, orientedHeight,
                PixelBufferFactory.bitDepth(image), colorSpace, orientation,
                payload.getIcc(), metadata);
    }

    public String getPixelSource() { return pixelSource; }
    public String getMetadataSource() { return metadataSource; }
    public int getWidth() { return width; }
    public int getHeight() { return height; }
    public int getDecodedWidth() { return decodedWidth; }
    public int getDecodedHeight() { return decodedHeight; }
    public int getOrientedWidth() { return orientedWidth; }
    public int getOrientedHeight() { return orientedHeight; }
    public int getBitDepth() { return bitDepth; }
    public String getColorSpace() { return colorSpace; }
    public int getOrientation() { return orientation; }
    public byte[] getIcc() { return icc == null ? null : icc.clone(); }
    public FidelityReport.MetadataFacts getMetadata() { return metadata; }

    public FidelityReport.Facts toFacts() {
        final FidelityReport.Facts facts = new FidelityReport.Facts();
        facts.setWidth(width);
        facts.setHeight(height);
        facts.setDecodedWidth(decodedWidth);
        facts.setDecodedHeight(decodedHeight);
        facts.setOrientedWidth(orientedWidth);
        facts.setOrientedHeight(orientedHeight);
        facts.setBitDepth(bitDepth);
        facts.setColorSpace(colorSpace);
        facts.setOrientation(orientation);
        facts.setOrientationApplied(true);
        final FidelityReport.IccFacts iccFacts = new FidelityReport.IccFacts();
        iccFacts.setState(icc == null || icc.length == 0 ? "absent" : "present");
        iccFacts.setByteLength(icc == null ? null : icc.length);
        if (icc != null && icc.length > 0) {
            iccFacts.setSha256(sha256(icc));
            try {
                ICC_Profile.getInstance(icc);
            } catch (RuntimeException ignored) {
                iccFacts.setState("invalid");
            }
        }
        facts.setIcc(iccFacts);
        facts.setMetadata(metadata);
        return facts;
    }

    private static FidelityReport.MetadataFacts emptyMetadata() {
        return new FidelityReport.MetadataFacts();
    }

    private static String sha256(final byte[] value) {
        try {
            final byte[] digest = MessageDigest.getInstance("SHA-256").digest(value);
            final StringBuilder result = new StringBuilder(digest.length * 2);
            for (byte datum : digest) result.append(String.format("%02x", datum));
            return result.toString();
        } catch (Exception exception) {
            return null;
        }
    }
}
