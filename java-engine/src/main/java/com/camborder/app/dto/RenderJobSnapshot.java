package com.camborder.app.dto;

import com.camborder.app.model.RenderRecipe;

/**
 * 单张导出任务快照：在提交时同时冻结渲染配方与导出设置。
 *
 * 任务执行与工作台编辑状态解耦；排队期间用户继续改模板、选图或导出设置，
 * 都不会修改已经接受的导出内容。
 */
public final class RenderJobSnapshot {

    private RenderRecipe recipe;
    private ExportSettings export;

    public RenderJobSnapshot() {
    }

    public RenderJobSnapshot(final RenderRecipe recipe, final ExportSettings export) {
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
