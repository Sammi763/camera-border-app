package com.camborder.app.dto;

/**
 * 单个样片条目 DTO：文件名 + 绝对路径。
 * 序列化为 {"fileName":..,"imagePath":..}，与历史 LinkedHashMap 结构一致。
 */
public final class DevPhotoEntry {

    private final String fileName;
    private final String imagePath;

    public DevPhotoEntry(final String fileName, final String imagePath) {
        this.fileName = fileName;
        this.imagePath = imagePath;
    }

    public String getFileName() {
        return fileName;
    }

    public String getImagePath() {
        return imagePath;
    }
}
