package com.camborder.app.util;

/**
 * 底片线性工作空间色彩数学（T04）。
 *
 * 工作空间固定为线性 Rec.2020；这里只做矩阵/传递函数运算，不经过 CMM、不夹断负值。
 * 恒等路径必须绕过任何转换：同空间零调整直接复制浮点数据。
 */
public final class FilmColorSpace {

    /** sRGB 线性 RGB -> CIE XYZ（D65）。 */
    private static final double[][] SRGB_TO_XYZ = {
            {0.41239079926595934, 0.357584339383878, 0.1804807884018343},
            {0.21263900587151027, 0.715168678767756, 0.07219231536073371},
            {0.01933081871559185, 0.11919477979462599, 0.9505321522496607}
    };

    /** Rec.2020 线性 RGB -> CIE XYZ（D65）。 */
    private static final double[][] REC2020_TO_XYZ = {
            {0.6369580483012914, 0.14461690358620832, 0.1688809751641721},
            {0.2627002120112671, 0.6779980715188708, 0.05930171646986196},
            {0.0, 0.028072693049087428, 1.060985057710791}
    };

    /** CIE XYZ -> Rec.2020 线性 RGB。 */
    private static final double[][] XYZ_TO_REC2020 = {
            {1.716651187971268, -0.355670783776392, -0.253366281373660},
            {-0.666684351832489, 1.616481236634939, 0.015768545813911},
            {0.017639857445311, -0.042770613257809, 0.942103121235474}
    };

    private static final double[][] SRGB_TO_REC2020 = multiply(XYZ_TO_REC2020, SRGB_TO_XYZ);
    private static final double[][] REC2020_TO_SRGB_DIRECT = invert3(SRGB_TO_REC2020);

    private FilmColorSpace() { }

    /** 每张图只融合一次相机矩阵，避免每像素创建临时数组。 */
    public static double[][] cameraToRec2020Matrix(final double[][] cameraToSrgb) {
        final double[][] rgb = new double[3][3];
        for (int row = 0; row < 3; row++) System.arraycopy(cameraToSrgb[row], 0, rgb[row], 0, 3);
        return multiply(SRGB_TO_REC2020, rgb);
    }

    public static void linearSrgbToRec2020(final float[] rgb, final float[] out) {
        multiply(SRGB_TO_REC2020, rgb, out);
    }

    public static void linearRec2020ToSrgb(final float[] rgb, final float[] out) {
        multiply(REC2020_TO_SRGB_DIRECT, rgb, out);
    }

    public static void linearRec2020ToXyz(final float[] rgb, final float[] out) {
        multiply(REC2020_TO_XYZ, rgb, out);
    }

    public static void xyzToLinearRec2020(final float[] xyz, final float[] out) {
        multiply(XYZ_TO_REC2020, xyz, out);
    }

    /**
     * 相机线性 RGB -> 线性 Rec.2020。
     *
     * rgbCam 是 LibRaw 的 camera -> sRGB 线性矩阵；helper 已在 RAW 阶段应用相机白平衡，
     * 这里只做颜色矩阵变换，不重复白平衡。
     */
    public static void cameraRgbToLinearRec2020(final float[][] rgbCam, final float[] rgb,
                                                final float[] out) {
        if (rgbCam == null || rgbCam.length < 3) {
            throw new IllegalArgumentException("rgbCam matrix is required");
        }
        final double[] srgb = new double[3];
        for (int row = 0; row < 3; row++) {
            srgb[row] = rgbCam[row][0] * rgb[0] + rgbCam[row][1] * rgb[1] + rgbCam[row][2] * rgb[2];
        }
        multiply(SRGB_TO_REC2020, new float[]{(float) srgb[0], (float) srgb[1], (float) srgb[2]}, out);
    }

    /** 相机线性 RGB -> 线性 Rec.2020（double 矩阵版本，供测试/外部校验使用）。 */
    public static void cameraRgbToLinearRec2020(final double[][] rgbCam, final float[] rgb,
                                                final float[] out) {
        if (rgbCam == null || rgbCam.length < 3) {
            throw new IllegalArgumentException("rgbCam matrix is required");
        }
        final double[] srgb = new double[3];
        for (int row = 0; row < 3; row++) {
            srgb[row] = rgbCam[row][0] * rgb[0] + rgbCam[row][1] * rgb[1] + rgbCam[row][2] * rgb[2];
        }
        multiply(SRGB_TO_REC2020, new float[]{(float) srgb[0], (float) srgb[1], (float) srgb[2]}, out);
    }

    /** sRGB 编码值（0..1）-> 线性光；不夹断，输入可超出 [0,1] 按公式外推。 */
    public static double encodedSrgbToLinear(final double encoded) {
        if (encoded <= 0.04045) {
            return encoded / 12.92;
        }
        return Math.pow((encoded + 0.055) / 1.055, 2.4);
    }

    /** 线性光 -> sRGB 编码值；不夹断，调用方决定输出阶段是否量化/裁剪。 */
    public static double linearToEncodedSrgb(final double linear) {
        if (linear <= 0.0031308) {
            return linear * 12.92;
        }
        return 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
    }

    public static double clamp01(final double value) {
        if (value < 0) return 0;
        if (value > 1) return 1;
        return value;
    }

    private static void multiply(final double[][] matrix, final float[] input, final float[] out) {
        if (input.length < 3 || out.length < 3) {
            throw new IllegalArgumentException("rgb array must have 3 channels");
        }
        final double x = input[0];
        final double y = input[1];
        final double z = input[2];
        out[0] = (float) (matrix[0][0] * x + matrix[0][1] * y + matrix[0][2] * z);
        out[1] = (float) (matrix[1][0] * x + matrix[1][1] * y + matrix[1][2] * z);
        out[2] = (float) (matrix[2][0] * x + matrix[2][1] * y + matrix[2][2] * z);
    }

    private static double[][] multiply(final double[][] left, final double[][] right) {
        final double[][] result = new double[3][3];
        for (int row = 0; row < 3; row++) {
            for (int column = 0; column < 3; column++) {
                double sum = 0;
                for (int index = 0; index < 3; index++) {
                    sum += left[row][index] * right[index][column];
                }
                result[row][column] = sum;
            }
        }
        return result;
    }

    private static double[][] invert3(final double[][] matrix) {
        final double a = matrix[0][0];
        final double b = matrix[0][1];
        final double c = matrix[0][2];
        final double d = matrix[1][0];
        final double e = matrix[1][1];
        final double f = matrix[1][2];
        final double g = matrix[2][0];
        final double h = matrix[2][1];
        final double i = matrix[2][2];
        final double det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
        if (Math.abs(det) < 1e-18) {
            throw new IllegalStateException("matrix is singular");
        }
        return new double[][]{
                {(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det},
                {(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det},
                {(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det}
        };
    }
}
