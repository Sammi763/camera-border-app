package com.camborder.app.util;

import com.camborder.app.exception.RenderExportException;
import com.camborder.app.exception.RenderOutputConflictException;

import java.io.File;
import java.io.IOException;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;

/**
 * 输出路径校验器（无状态纯函数工具）。
 * 单一职责：解析 outputPath、准备父目录并阻止覆盖已有文件，不关心图像编码。
 *
 * @throws RenderExportException outputPath 为空、父目录无法创建或不是目录时抛出
 * @throws RenderOutputConflictException outputPath 已存在时抛出
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
        final File outputFile;
        try {
            outputFile = Path.of(outputPath.trim()).toFile();
        } catch (InvalidPathException exception) {
            throw new RenderExportException("outputPath is invalid");
        }

        // 编码器是最后一道防线：即使两个请求在校验后发生竞态，也不能覆盖已有文件。
        if (outputFile.exists()) {
            throw new RenderOutputConflictException("outputPath already exists");
        }

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

    /**
     * 返回用于冲突比较的规范化路径。
     * 已存在的路径解析符号链接；尚不存在的目标则解析其已存在的父目录，
     * 从而识别同一目录下的别名路径，同时不提前创建输出目录。
     */
    public static Path normalizeForComparison(final String rawPath, final String fieldName) {
        if (rawPath == null || rawPath.isBlank()) {
            throw new RenderExportException(fieldName + " is required");
        }
        final Path absolute;
        try {
            absolute = Path.of(rawPath.trim()).toAbsolutePath().normalize();
        } catch (InvalidPathException exception) {
            throw new RenderExportException(fieldName + " is invalid");
        }

        try {
            return absolute.toRealPath();
        } catch (IOException ignored) {
            // 目标尚不存在时继续解析父目录；父目录也可能尚不存在。
        }

        Path parent = absolute.getParent();
        if (parent == null) {
            return absolute;
        }
        try {
            return parent.toRealPath().resolve(absolute.getFileName()).normalize();
        } catch (IOException ignored) {
            return absolute;
        }
    }
}
