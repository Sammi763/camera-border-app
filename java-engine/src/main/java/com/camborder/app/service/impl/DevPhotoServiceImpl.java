package com.camborder.app.service.impl;

import com.camborder.app.dto.DevPhotoEntry;
import com.camborder.app.service.DevPhotoService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

/**
 * 开发期样片服务实现（service.impl 层）。
 * 列出仓库根目录 photos/ 下的 jpg/jpeg/tif/tiff 图片，按文件名排序。
 * 仅用于本地开发调试，不属于长期对外契约。
 */
@Service
public final class DevPhotoServiceImpl implements DevPhotoService {

    private static final List<String> SUPPORTED_EXTENSIONS =
            List.of("jpg", "jpeg", "tif", "tiff");

    /**
     * 可覆盖的 photos 目录路径。为空时按默认规则解析（相对工作目录的 ../photos）。
     * 主要用于测试与本地覆盖，默认不配置。
     */
    private final String photosDirOverride;

    public DevPhotoServiceImpl(@Value("${app.dev.photos-dir:}") final String photosDirOverride) {
        this.photosDirOverride = photosDirOverride;
    }

    @Override
    public List<DevPhotoEntry> listPhotos() {
        File photosDir = resolvePhotosDirectory();
        if (photosDir == null || !photosDir.isDirectory()) {
            return Collections.emptyList();
        }
        File[] files = photosDir.listFiles(this::isSupportedImage);
        if (files == null) {
            return Collections.emptyList();
        }
        return Arrays.stream(files)
                .sorted(Comparator.comparing(File::getName, String.CASE_INSENSITIVE_ORDER))
                .map(file -> new DevPhotoEntry(file.getName(), file.getAbsolutePath()))
                .collect(Collectors.toList());
    }

    /**
     * 判断文件是否为支持的图片（按扩展名，不区分大小写，且必须是普通文件）。
     */
    private boolean isSupportedImage(final File dir, final String name) {
        File file = new File(dir, name);
        if (!file.isFile()) {
            return false;
        }
        int dot = name.lastIndexOf('.');
        if (dot < 0 || dot == name.length() - 1) {
            return false;
        }
        String ext = name.substring(dot + 1).toLowerCase(Locale.ROOT);
        return SUPPORTED_EXTENSIONS.contains(ext);
    }

    /**
     * 定位仓库根目录下的 photos 目录。
     * 解析顺序：显式覆盖路径 -> 相对工作目录的 ../photos -> 相对工作目录的 photos。
     * 都找不到时返回 null，由调用方返回空列表（不抛 500）。
     */
    private File resolvePhotosDirectory() {
        if (photosDirOverride != null && !photosDirOverride.isBlank()) {
            File override = new File(photosDirOverride).getAbsoluteFile();
            if (override.isDirectory()) {
                return override;
            }
            // 显式配置但目录不存在时，返回该路径让 listPhotos 统一走空分支
            return override;
        }
        String userDir = System.getProperty("user.dir");
        if (userDir != null) {
            File candidate = new File(userDir, "../photos").getAbsoluteFile();
            if (candidate.isDirectory()) {
                return candidate;
            }
            File current = new File(userDir, "photos").getAbsoluteFile();
            if (current.isDirectory()) {
                return current;
            }
        }
        return null;
    }
}
