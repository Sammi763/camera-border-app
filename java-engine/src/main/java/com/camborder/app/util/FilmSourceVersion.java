package com.camborder.app.util;

import com.camborder.app.exception.FilmProcessingException;
import org.springframework.http.HttpStatus;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;

/** 底片读取和编码共用的内容指纹，校验元数据写回期间的源文件变化。 */
public final class FilmSourceVersion {
    private FilmSourceVersion() { }
    public static String read(final Path path) {
        try {
            final BasicFileAttributes before = Files.readAttributes(path, BasicFileAttributes.class);
            if (!before.isRegularFile()) throw new IllegalArgumentException("源路径不是常规文件");
            final MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (java.io.InputStream input = Files.newInputStream(path)) {
                final byte[] buffer = new byte[1024 * 1024]; int n;
                while ((n = input.read(buffer)) >= 0) { FilmRequestGuard.check(); digest.update(buffer, 0, n); }
            }
            final BasicFileAttributes after = Files.readAttributes(path, BasicFileAttributes.class);
            if (before.size() != after.size() || !before.lastModifiedTime().equals(after.lastModifiedTime())
                    || !java.util.Objects.equals(before.fileKey(), after.fileKey())) changed();
            final StringBuilder hex = new StringBuilder(64);
            for (byte b : digest.digest()) hex.append(String.format(java.util.Locale.ROOT, "%02x", b));
            return "sha256:" + hex + ";size:" + after.size() + ";mtime:" + after.lastModifiedTime().toMillis();
        } catch (FilmProcessingException e) { throw e; }
        catch (Exception e) { throw new FilmProcessingException("源版本无法读取", HttpStatus.BAD_REQUEST, "FILM_SOURCE_VERSION_FAILED"); }
    }
    public static void require(final Path path, final String expected) {
        if (expected != null && !expected.equals(read(path))) changed();
    }
    private static void changed() { throw new FilmProcessingException("源文件已变化，请重新取样后导出", HttpStatus.CONFLICT, "FILM_SOURCE_CHANGED"); }
}
