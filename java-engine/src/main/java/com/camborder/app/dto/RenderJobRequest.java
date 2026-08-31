package com.camborder.app.dto;

import com.camborder.app.model.RenderRecipe;

import java.util.ArrayList;
import java.util.List;

/**
 * 渲染导出任务请求 DTO：一张或多张不可变导出快照。
 *
 * JSON 契约只使用 {@code items}。保留单图构造函数是为了让 Java 调用方
 * 可以平滑迁移；序列化时仍会得到一个元素的 items 数组。
 */
public final class RenderJobRequest {

    private List<RenderJobSnapshot> items = new ArrayList<>();

    public RenderJobRequest() {
    }

    public RenderJobRequest(final RenderRecipe recipe, final ExportSettings export) {
        this.items = new ArrayList<>(List.of(new RenderJobSnapshot(recipe, export)));
    }

    public RenderJobRequest(final List<RenderJobSnapshot> items) {
        setItems(items);
    }

    public List<RenderJobSnapshot> getItems() {
        return items;
    }

    public void setItems(final List<RenderJobSnapshot> items) {
        this.items = items == null ? null : new ArrayList<>(items);
    }
}
