package com.camborder.app.model;

/**
 * 边框风格配置（可选）：在纯色/渐变边框之上叠加确定性装饰。
 *
 * 与前端 RenderSettings.borderStyle 保持同一套风格 ID、参数语义与几何规则
 * （几何规格见 util/BorderStyleRenderer 的类注释）。
 *
 * 字段语义：
 * - id：风格标识；未识别的 id 在渲染时被静默忽略（回退为无边框风格的原始行为）
 * - intensity：强度 0-100，控制装饰的视觉浓度（线宽、透明度、锯齿幅度等）
 * - edgeWidth：装饰特征尺寸（像素），如线框外扩距离、齿孔高度、撕边宽度
 * - holeCount：齿孔/刻痕类装饰的数量（仅齿孔、负片边使用）
 * - paperTone：纸色/装饰色（hex，如 "#e8e8e8"）；为空时按各风格的默认色处理，
 *   格式非法时与其它颜色字段一致返回 4xx 受控错误
 *
 * 旧模板没有该字段（null）时必须保持原有渲染行为。
 */
public final class BorderStyle {

    private String id;
    private int intensity;
    private int edgeWidth;
    private int holeCount;
    private String paperTone;

    public BorderStyle() {
    }

    public BorderStyle(final String id, final int intensity, final int edgeWidth,
                       final int holeCount, final String paperTone) {
        this.id = id;
        this.intensity = intensity;
        this.edgeWidth = edgeWidth;
        this.holeCount = holeCount;
        this.paperTone = paperTone;
    }

    public String getId() {
        return id;
    }

    public void setId(final String id) {
        this.id = id;
    }

    public int getIntensity() {
        return intensity;
    }

    public void setIntensity(final int intensity) {
        this.intensity = intensity;
    }

    public int getEdgeWidth() {
        return edgeWidth;
    }

    public void setEdgeWidth(final int edgeWidth) {
        this.edgeWidth = edgeWidth;
    }

    public int getHoleCount() {
        return holeCount;
    }

    public void setHoleCount(final int holeCount) {
        this.holeCount = holeCount;
    }

    public String getPaperTone() {
        return paperTone;
    }

    public void setPaperTone(final String paperTone) {
        this.paperTone = paperTone;
    }
}
