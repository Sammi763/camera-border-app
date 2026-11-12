package com.camborder.app.dto;

import com.camborder.app.model.RenderRecipe;

/**
 * 预览请求 DTO：渲染配方 + 预览最大宽高约束。
 */
public final class PreviewRequest {

    private String clientId;
    private long generation;
    public String getClientId() { return clientId; }
    public void setClientId(final String value) { clientId = value; }
    public long getGeneration() { return generation; }
    public void setGeneration(final long value) { generation = value; }

    private RenderRecipe recipe;
    /** 底片对比阶段；缺省为当前正片。 */
    private String stage;
    private boolean actualPixels;
    public boolean isActualPixels() { return actualPixels; }
    public void setActualPixels(final boolean value) { actualPixels = value; }
    /** 取样视图使用完整有向源坐标，不应用编辑几何和版式。 */
    private boolean sourceCoordinates;
    public String getStage() { return stage; }
    public void setStage(final String stage) { this.stage = stage; }
    public boolean isSourceCoordinates() { return sourceCoordinates; }
    public void setSourceCoordinates(final boolean value) { sourceCoordinates = value; }

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
