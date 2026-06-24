package com.camborder.app.util;

import com.camborder.app.exception.PreviewGenerationException;

import java.awt.Color;

/**
 * 颜色解析器（无状态纯函数工具）。
 * 仅接受四种格式：#RGB、RGB、#RRGGBB、RRGGBB。
 * 为空时返回 fallback（表示「未指定颜色，用默认值」，不属于格式非法）。
 * 其它长度（如 1、4、5、7 位）或包含非 hex 字符一律视为非法，抛出受控异常。
 */
public final class ColorParser {

    private ColorParser() {
    }

    /**
     * 解析颜色字符串。
     *
     * @param hex      颜色字符串
     * @param fallback 为空时的回退颜色
     * @throws PreviewGenerationException 颜色格式非法时抛出
     */
    public static Color parse(final String hex, final String fallback) {
        String value = hex;
        if (value == null || value.isBlank()) {
            value = fallback;
        }
        String stripped = value.trim();
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
     * 判断字符是否为 hex 字符（0-9 / a-f / A-F）。
     */
    private static boolean isHexChar(final char c) {
        return (c >= '0' && c <= '9')
                || (c >= 'a' && c <= 'f')
                || (c >= 'A' && c <= 'F');
    }
}
