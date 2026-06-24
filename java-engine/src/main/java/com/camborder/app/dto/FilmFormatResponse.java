package com.camborder.app.dto;

/**
 * 画幅默认值响应 DTO。
 * 字段：id（枚举标识）、label（展示名）、aspectRatio（宽高比）、recommendedBorder（推荐边框）。
 */
public final class FilmFormatResponse {

    private final String id;
    private final String label;
    private final String aspectRatio;
    private final FilmFormatBorder recommendedBorder;

    public FilmFormatResponse(final String id, final String label, final String aspectRatio,
                              final FilmFormatBorder recommendedBorder) {
        this.id = id;
        this.label = label;
        this.aspectRatio = aspectRatio;
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

    public FilmFormatBorder getRecommendedBorder() {
        return recommendedBorder;
    }
}
