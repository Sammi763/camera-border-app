package com.camborder.app.dto;

import com.camborder.app.model.RenderRecipe;

/**
 * 渲染导出任务请求 DTO：渲染配方 + 导出设置。
 */
public final class RenderJobRequest {

    private RenderRecipe recipe;
    private ExportSettings export;

    public RenderJobRequest() {
    }

    public RenderJobRequest(final RenderRecipe recipe, final ExportSettings export) {
        this.recipe = recipe;
        this.export = export;
    }

    public RenderRecipe getRecipe() {
        return recipe;
    }

    public void setRecipe(final RenderRecipe recipe) {
        this.recipe = recipe;
    }

    public ExportSettings getExport() {
        return export;
    }

    public void setExport(final ExportSettings export) {
        this.export = export;
    }
}
