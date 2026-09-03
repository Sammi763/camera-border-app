package com.camborder.app.dto;

/**
 * 画幅默认值响应 DTO。
 * 字段：id（枚举标识）、label（展示名）、aspectRatio（宽高比）、recommendedBorder（推荐边框）。
 */
public final class FilmFormatResponse {

    private final String id;
    private final String label;
    private final String aspectRatio;
    private final Double targetAspectRatio;
    private final FilmFormatBorder recommendedBorder;

    public FilmFormatResponse(final String id, final String label, final String aspectRatio,
                              final FilmFormatBorder recommendedBorder) {
        this(id, label, aspectRatio, parseAspectRatio(aspectRatio), recommendedBorder);
    }

    public FilmFormatResponse(final String id, final String label, final String aspectRatio,
                              final Double targetAspectRatio,
                              final FilmFormatBorder recommendedBorder) {
        this.id = id;
        this.label = label;
        this.aspectRatio = aspectRatio;
        this.targetAspectRatio = targetAspectRatio;
        this.recommendedBorder = recommendedBorder;
    }

    public String getId() {
        return id;
    }

    public String getLabel() {
        return label;
    }

    public String getAspectRatio() {
        return aspectRatio;
    }

    /** 渲染配方使用的明确数值比例。 */
    public Double getTargetAspectRatio() {
        return targetAspectRatio;
    }

    public FilmFormatBorder getRecommendedBorder() {
        return recommendedBorder;
    }

    private static Double parseAspectRatio(final String ratio) {
        if (ratio == null || !ratio.contains(":")) {
            return null;
        }
        try {
            String[] parts = ratio.split(":", 2);
            double width = Double.parseDouble(parts[0]);
            double height = Double.parseDouble(parts[1]);
            return width > 0 && height > 0 ? width / height : null;
        } catch (NumberFormatException exception) {
            return null;
        }
    }
}
