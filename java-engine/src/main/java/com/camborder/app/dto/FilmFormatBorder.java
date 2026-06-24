package com.camborder.app.dto;

/**
 * 画幅推荐边框 DTO：{top, bottom, left, right}。
 * 仅作为前端填充默认值的建议，后端不强制应用。
 */
public final class FilmFormatBorder {

    private final int top;
    private final int bottom;
    private final int left;
    private final int right;

    public FilmFormatBorder(final int top, final int bottom, final int left, final int right) {
        this.top = top;
        this.bottom = bottom;
        this.left = left;
        this.right = right;
    }

    public int getTop() {
        return top;
    }

    public int getBottom() {
        return bottom;
    }

    public int getLeft() {
        return left;
    }

    public int getRight() {
        return right;
    }
}
