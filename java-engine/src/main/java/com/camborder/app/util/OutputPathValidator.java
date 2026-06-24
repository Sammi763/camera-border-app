package com.camborder.app.util;

import com.camborder.app.exception.RenderExportException;

import java.io.File;
import java.nio.file.Path;

/**
 * 输出路径校验器（无状态纯函数工具）。
 * 单一职责：解析 outputPath 为 File，并确保父目录存在且可写，不关心图像编码。
 *
 * @throws RenderExportException outputPath 为空、父目录无法创建或不是目录时抛出
 */
public final class OutputPathValidator {

    private OutputPathValidator() {
    }

    /**
     * 解析 outputPath 并准备好父目录，返回目标输出文件。
     * 空路径直接拒绝为 4xx；父目录不存在时尝试创建，创建失败或已存在但非目录视为不可写。
     */
    public static File resolveAndPrepare(final String outputPath) {
        if (outputPath == null || outputPath.isBlank()) {
            throw new RenderExportException("outputPath is required");
        }
        File outputFile = Path.of(outputPath.trim()).toFile();

        File parent = outputFile.getParentFile();
        // 父目录不存在时尝试创建；创建失败或已存在但不是目录，视为不可写
        if (parent != null && !parent.exists()) {
            if (!parent.mkdirs()) {
                throw new RenderExportException("output directory is not writable");
            }
        }
        if (parent != null && !parent.isDirectory()) {
            throw new RenderExportException("output path is not a directory");
        }
        return outputFile;
    }
}
