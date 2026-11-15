package com.camborder.app.util;

import java.awt.color.ColorSpace;
import java.awt.color.ICC_Profile;
import java.awt.image.BufferedImage;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;

/** 线性 Rec.2020 输出定义：D65 基色适配到 ICC D50 PCS，TRC 明确为 1。 */
public final class FilmOutputProfile {
    private FilmOutputProfile() { }
    private static final byte[] LINEAR_REC2020 = create();

    public static byte[] linearRec2020() { return LINEAR_REC2020.clone(); }

    private static byte[] create() {
        // ICC 登记的 D65→D50 Bradford 适配；基色矩阵与 FilmColorSpace 同源。
        final double[][] adaptation = {{1.04788600322255, 0.02291876517478, -0.05021609531173},
                {0.02958178249800, 0.99048351849055, -0.01707870770448},
                {-0.00925188083921, 0.01507260748703, 0.75167813361760}};
        final byte[] template = ICC_Profile.getInstance(ColorSpace.CS_LINEAR_RGB).getData();
        final byte[] header = java.util.Arrays.copyOf(template, 128);
        header[8] = 2; header[9] = 0x30;
        java.util.Arrays.fill(header, 84, 100, (byte) 0);
        final java.util.Map<Integer, byte[]> payloads = new java.util.LinkedHashMap<>();
        final ByteBuffer original = ByteBuffer.wrap(template).order(ByteOrder.BIG_ENDIAN);
        final int count = original.getInt(128);
        for (int i = 0; i < count; i++) {
            final int entry = 132 + i * 12;
            final int offset = original.getInt(entry + 4), length = original.getInt(entry + 8);
            payloads.put(original.getInt(entry), java.util.Arrays.copyOfRange(template, offset, offset + length));
        }
        final int[] tags = {ICC_Profile.icSigRedColorantTag, ICC_Profile.icSigGreenColorantTag,
                ICC_Profile.icSigBlueColorantTag};
        for (int c = 0; c < 3; c++) {
            final float[] rgb = new float[3]; rgb[c] = 1;
            final float[] xyz = new float[3]; FilmColorSpace.linearRec2020ToXyz(rgb, xyz);
            final ByteBuffer data = ByteBuffer.allocate(20).order(ByteOrder.BIG_ENDIAN);
            data.putInt(0x58595a20).putInt(0);
            for (int row = 0; row < 3; row++) {
                final double value = adaptation[row][0] * xyz[0] + adaptation[row][1] * xyz[1] + adaptation[row][2] * xyz[2];
                data.putInt((int) Math.round(value * 65536));
            }
            payloads.put(tags[c], data.array());
        }
        // 显式线性曲线，不能沿用电视 BT.2020 的非线性编码。
        final byte[] trc = ByteBuffer.allocate(14).order(ByteOrder.BIG_ENDIAN)
                .putInt(0x63757276).putInt(0).putInt(1).putShort((short) 256).array();
        for (int tag : new int[]{ICC_Profile.icSigRedTRCTag, ICC_Profile.icSigGreenTRCTag, ICC_Profile.icSigBlueTRCTag})
            payloads.put(tag, trc);
        final byte[] name = "Camera Border Linear Rec.2020\0".getBytes(StandardCharsets.US_ASCII);
        final ByteBuffer desc = ByteBuffer.allocate(12 + name.length + 78).order(ByteOrder.BIG_ENDIAN);
        desc.putInt(0x64657363).putInt(0).putInt(name.length).put(name);
        payloads.put(ICC_Profile.icSigProfileDescriptionTag, desc.array());
        // 一次构造完整 ICC，避免 Java 11 的旧 CMM 在逐个改写矩阵标签时拒绝中间状态。
        int size = 132 + payloads.size() * 12;
        for (byte[] value : payloads.values()) size += (value.length + 3) & ~3;
        final ByteBuffer packed = ByteBuffer.allocate(size).order(ByteOrder.BIG_ENDIAN);
        packed.put(header); packed.putInt(0, size); packed.position(128); packed.putInt(payloads.size());
        int offset = 132 + payloads.size() * 12;
        for (java.util.Map.Entry<Integer, byte[]> entry : payloads.entrySet()) {
            packed.putInt(entry.getKey()).putInt(offset).putInt(entry.getValue().length);
            System.arraycopy(entry.getValue(), 0, packed.array(), offset, entry.getValue().length);
            offset += (entry.getValue().length + 3) & ~3;
        }
        return packed.array();
    }

    public static BufferedImage toLinearRec2020(final FloatRgbImage image) {
        final BufferedImage output = PixelBufferFactory.create(image.getWidth(), image.getHeight(), 16, false,
                new java.awt.color.ICC_ColorSpace(ICC_Profile.getInstance(LINEAR_REC2020)));
        for (int y = 0; y < image.getHeight(); y++) for (int x = 0; x < image.getWidth(); x++)
            for (int c = 0; c < 3; c++) output.getRaster().setSample(x, y, c,
                    (int) Math.round(FilmColorSpace.clamp01(image.get(x, y, c)) * 65535));
        return output;
    }
}
