package com.camborder.app.dto;

import com.camborder.app.model.RenderRecipe;

/**
 * 预览请求 DTO：渲染配方 + 预览最大宽高约束。
 */
public final class PreviewRequest {

    private RenderRecipe recipe;
    private int maxWidth;
    private int maxHeight;

    public PreviewRequest() {
    }

    public PreviewRequest(final RenderRecipe recipe, final int maxWidth, final int maxHeight) {
        this.recipe = recipe;
        this.maxWidth = maxWidth;
        this.maxHeight = maxHeight;
    }

    public RenderRecipe getRecipe() {
        return recipe;
    }

    public void setRecipe(final RenderRecipe recipe) {
        this.recipe = recipe;
    }

    public int getMaxWidth() {
        return maxWidth;
    }

    public void setMaxWidth(final int maxWidth) {
        this.maxWidth = maxWidth;
    }

    public int getMaxHeight() {
        return maxHeight;
    }

    public void setMaxHeight(final int maxHeight) {
        this.maxHeight = maxHeight;
    }
}
