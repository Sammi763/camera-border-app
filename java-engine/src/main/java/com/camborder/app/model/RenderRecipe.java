package com.camborder.app.model;

import java.util.List;

/**
 * 渲染配方（内部业务模型）：源图路径、边框、文字列表等。
 *
 * 当前兼具 DTO 嵌套模型角色：作为 {@code PreviewRequest.recipe} /
 * {@code RenderJobSnapshot.recipe} 的嵌套字段直接参与 JSON 序列化。
 * v2 用 imagePlacement 表达完整图片几何；旧画幅参数只在兼容构造中接收，不参与渲染。
 */
public final class RenderRecipe {

    private String imagePath;
    private BorderConfig border;
    private GradientConfig gradient;
    private List<TextItem> texts;
    private ImagePlacement imagePlacement;
    private LogoConfig logo;
    /** 可选边框风格；null 或未识别 id 时保持原始渲染行为。 */
    private BorderStyle borderStyle;

    public RenderRecipe() {
    }

    /**
     * 兼容旧构造：不带 gradient，gradient 默认为 null（等价于不启用渐变，退回纯色边框）。
     */
    public RenderRecipe(final String imagePath, final BorderConfig border,
                        final List<TextItem> texts, final String legacyFormat,
                        final boolean legacyCrop) {
        this(imagePath, border, null, texts, new ImagePlacement(), null);
    }

    public RenderRecipe(final String imagePath, final BorderConfig border,
                        final GradientConfig gradient,
                        final List<TextItem> texts, final String legacyFormat,
                        final boolean legacyCrop) {
        this(imagePath, border, gradient, texts, new ImagePlacement(), null);
    }

    public RenderRecipe(final String imagePath, final BorderConfig border,
                        final GradientConfig gradient,
                        final List<TextItem> texts, final String legacyFormat,
                        final boolean legacyCrop, final LogoConfig logo) {
        this(imagePath, border, gradient, texts, new ImagePlacement(), logo);
    }

    /** v2 构造：图片布局由 imagePlacement 明确表达。 */
    public RenderRecipe(final String imagePath, final BorderConfig border,
                        final GradientConfig gradient,
                        final List<TextItem> texts, final ImagePlacement imagePlacement,
                        final LogoConfig logo) {
        this.imagePath = imagePath;
        this.border = border;
        this.gradient = gradient;
        this.texts = texts;
        this.imagePlacement = imagePlacement;
        this.logo = logo;
        this.borderStyle = null;
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

    public ImagePlacement getImagePlacement() {
        return imagePlacement == null ? new ImagePlacement() : imagePlacement;
    }

    public void setImagePlacement(final ImagePlacement imagePlacement) {
        this.imagePlacement = imagePlacement;
    }

    public LogoConfig getLogo() {
        return logo;
    }

    public void setLogo(final LogoConfig logo) {
        this.logo = logo;
    }

    public BorderStyle getBorderStyle() {
        return borderStyle;
    }

    public void setBorderStyle(final BorderStyle borderStyle) {
        this.borderStyle = borderStyle;
    }
}
