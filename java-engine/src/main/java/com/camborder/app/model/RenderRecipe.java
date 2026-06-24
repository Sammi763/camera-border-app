package com.camborder.app.model;

import java.util.List;

/**
 * 渲染配方（内部业务模型）：源图路径、边框、文字列表等。
 *
 * 当前兼具 DTO 嵌套模型角色：作为 {@code PreviewRequest.recipe} / {@code RenderJobRequest.recipe}
 * 的嵌套字段直接参与 JSON 序列化，字段保持不变以兼容前端契约。
 */
public final class RenderRecipe {

    private String imagePath;
    private BorderConfig border;
    private GradientConfig gradient;
    private List<TextItem> texts;
    private String filmFormat;
    private boolean autoCrop;

    public RenderRecipe() {
    }

    /**
     * 兼容旧构造：不带 gradient，gradient 默认为 null（等价于不启用渐变，退回纯色边框）。
     */
    public RenderRecipe(final String imagePath, final BorderConfig border,
                        final List<TextItem> texts, final String filmFormat,
                        final boolean autoCrop) {
        this(imagePath, border, null, texts, filmFormat, autoCrop);
    }

    public RenderRecipe(final String imagePath, final BorderConfig border,
                        final GradientConfig gradient,
                        final List<TextItem> texts, final String filmFormat,
                        final boolean autoCrop) {
        this.imagePath = imagePath;
        this.border = border;
        this.gradient = gradient;
        this.texts = texts;
        this.filmFormat = filmFormat;
        this.autoCrop = autoCrop;
    }

    public String getImagePath() {
        return imagePath;
    }

    public void setImagePath(final String imagePath) {
        this.imagePath = imagePath;
    }

    public BorderConfig getBorder() {
        return border;
    }

    public void setBorder(final BorderConfig border) {
        this.border = border;
    }

    public GradientConfig getGradient() {
        return gradient;
    }

    public void setGradient(final GradientConfig gradient) {
        this.gradient = gradient;
    }

    public List<TextItem> getTexts() {
        return texts;
    }

    public void setTexts(final List<TextItem> texts) {
        this.texts = texts;
    }

    public String getFilmFormat() {
        return filmFormat;
    }

    public void setFilmFormat(final String filmFormat) {
        this.filmFormat = filmFormat;
    }

    public boolean isAutoCrop() {
        return autoCrop;
    }

    public void setAutoCrop(final boolean autoCrop) {
        this.autoCrop = autoCrop;
    }
}
