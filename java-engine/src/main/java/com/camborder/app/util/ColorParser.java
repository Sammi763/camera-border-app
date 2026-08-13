package com.camborder.app.util;

import com.camborder.app.exception.PreviewGenerationException;

import java.awt.Color;

/**
 * 颜色解析器（无状态纯函数工具）。
 * 接受五种格式：#RGB、RGB、#RRGGBB、RRGGBB、rgba(r,g,b,a)。
 * 为空时返回 fallback（表示「未指定颜色，用默认值」，不属于格式非法）。
 * 其它格式一律视为非法，抛出受控异常。
 */
public final class ColorParser {

    private ColorParser() {
    }

    /**
     * 解析颜色字符串。
     *
     * @param hex      颜色字符串（#RRGGBB 或 rgba(r,g,b,a)）
     * @param fallback 为空时的回退颜色
     * @throws PreviewGenerationException 颜色格式非法时抛出
     */
    public static Color parse(final String hex, final String fallback) {
        String value = hex;
        if (value == null || value.isBlank()) {
            value = fallback;
        }
        String stripped = value.trim();

        // 支持 rgba(r,g,b,a) 格式
        if (stripped.startsWith("rgba(") && stripped.endsWith(")")) {
            return parseRgba(stripped);
        }

        if (stripped.startsWith("#")) {
            stripped = stripped.substring(1);
        }
        // 仅接受 3 位或 6 位，其它长度直接拒绝
        if (stripped.length() != 3 && stripped.length() != 6) {
            throw new PreviewGenerationException("invalid color: " + hex);
        }
        // 必须全部为 hex 字符，禁止 parseInt 容忍前导空格/符号等隐式行为
        for (int i = 0; i < stripped.length(); i++) {
            if (!isHexChar(stripped.charAt(i))) {
                throw new PreviewGenerationException("invalid color: " + hex);
            }
        }
        if (stripped.length() == 3) {
            // #RGB 展开为 #RRGGBB
            stripped = ""
                    + stripped.charAt(0) + stripped.charAt(0)
                    + stripped.charAt(1) + stripped.charAt(1)
                    + stripped.charAt(2) + stripped.charAt(2);
        }
        return new Color(Integer.parseInt(stripped, 16));
    }

    /**
     * 解析 rgba(r,g,b,a) 格式，a 范围 0-1。
     */
    private static Color parseRgba(final String rgba) {
        String inner = rgba.substring(5, rgba.length() - 1); // 去掉 "rgba(" 和 ")"
        String[] parts = inner.split(",");
        if (parts.length != 4) {
            throw new PreviewGenerationException("invalid rgba color: " + rgba);
        }
        try {
            int r = clamp(Integer.parseInt(parts[0].trim()), 0, 255);
            int g = clamp(Integer.parseInt(parts[1].trim()), 0, 255);
            int b = clamp(Integer.parseInt(parts[2].trim()), 0, 255);
            float a = (float) Math.max(0.0, Math.min(1.0, Double.parseDouble(parts[3].trim())));
            return new Color(r, g, b, a);
        } catch (NumberFormatException e) {
            throw new PreviewGenerationException("invalid rgba color: " + rgba);
        }
    }

    /**
     * 将数值钳制到 [min, max] 范围。
     */
    private static int clamp(final int value, final int min, final int max) {
        return Math.min(max, Math.max(min, value));
    }

    /**
     * 判断字符是否为 hex 字符（0-9 / a-f / A-F）。
     */
    private static boolean isHexChar(final char c) {
        return (c >= '0' && c <= '9')
                || (c >= 'a' && c <= 'f')
                || (c >= 'A' && c <= 'F');
    }
}
