package com.camborder.app.service;

/**
 * 文本变量格式化服务接口。
 * 将模板中的 {Camera}、{Lens} 等变量替换为实际摄影元数据值。
 */
public interface MetadataFormatService {

    /**
     * 将模板中的变量占位符替换为实际值，并清理多余分隔符。
     *
     * @param template 模板文本，包含 {Camera} 等变量
     * @param metadata 变量名到值的映射
     * @return 替换并清理后的最终文本
     */
    String format(String template, java.util.Map<String, String> metadata);
}
