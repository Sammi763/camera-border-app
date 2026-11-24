package com.camborder.app.util;

import com.camborder.app.exception.RenderExportException;
import com.camborder.app.exception.RenderOutputConflictException;
import com.sun.jna.Library;
import com.sun.jna.Native;
import com.sun.jna.Platform;
import com.sun.jna.WString;
import com.sun.jna.win32.StdCallLibrary;

import java.io.File;
import java.io.IOException;
import java.nio.file.InvalidPathException;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;

/**
 * 输出路径校验与排他发布工具，负责准备父目录和防止覆盖已有文件。
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
        if (Files.exists(outputFile.toPath(), LinkOption.NOFOLLOW_LINKS)) {
            throw new RenderOutputConflictException("outputPath already exists");
        }

        File parent = outputFile.getParentFile();
        // 父目录不存在时尝试创建；创建失败或已存在但不是目录，视为不可写
        if (parent != null && !parent.exists()) {
            if (!parent.mkdirs() && !parent.isDirectory()) {
                throw new RenderExportException("output directory is not writable");
            }
        }
        if (parent != null && !parent.isDirectory()) {
            throw new RenderExportException("output path is not a directory");
        }
        return outputFile;
    }

    /**
     * 在同目录发布已编码文件。硬链接同一时刻暴露完整内容，且永远不会替换已存在的目录项。
     * 系统排他改名覆盖不支持硬链接的卷；没有排他操作可用时保留导出失败。
     */
    static void publishNewFile(final Path staging, final Path target) throws IOException {
        try {
            Files.createLink(target, staging);
        } catch (FileAlreadyExistsException exception) {
            throw new RenderOutputConflictException("outputPath already exists");
        } catch (IOException | UnsupportedOperationException exception) {
            if (Files.exists(target, LinkOption.NOFOLLOW_LINKS)) {
                throw new RenderOutputConflictException("outputPath already exists");
            }
            if (staging.getFileSystem() != FileSystems.getDefault()) {
                throw new IOException("目标卷不支持排他发布", exception);
            }
            renameExclusive(staging.toAbsolutePath(), target.toAbsolutePath());
        }
    }

    static void renameExclusive(final Path staging, final Path target) throws IOException {
        final int error;
        try {
            if (Platform.isMac()) {
                final int renameExcl = 0x00000004; // macOS SDK RENAME_EXCL
                if (Native.load(Platform.C_LIBRARY_NAME, MacRename.class)
                        .renamex_np(staging.toString(), target.toString(), renameExcl) == 0) return;
                error = Native.getLastError();
            } else if (Platform.isWindows()) {
                // flags=0 保留现有目标，并禁止跨卷复制后删除。
                if (Native.load("kernel32", WindowsMove.class)
                        .MoveFileExW(new WString(staging.toString()), new WString(target.toString()), 0)) return;
                error = Native.getLastError();
            } else {
                throw new IOException("目标卷不支持硬链接发布");
            }
        } catch (LinkageError exception) {
            throw new IOException("系统不支持排他发布", exception);
        }
        if ((Platform.isWindows() ? error == 80 || error == 183 : error == 17)
                || Files.exists(target, LinkOption.NOFOLLOW_LINKS)) {
            throw new RenderOutputConflictException("outputPath already exists");
        }
        throw new IOException("排他发布失败，系统错误码 " + error);
    }

    private interface MacRename extends Library {
        int renamex_np(String staging, String target, int flags);
    }

    private interface WindowsMove extends StdCallLibrary {
        boolean MoveFileExW(WString staging, WString target, int flags);
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
