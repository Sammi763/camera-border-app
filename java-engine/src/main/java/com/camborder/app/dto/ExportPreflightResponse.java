package com.camborder.app.dto;

import java.util.ArrayList;
import java.util.List;

/** 导出前的逐项事实检查结果；不会写入输出文件。 */
public final class ExportPreflightResponse {

    private String status;
    private List<Item> items = new ArrayList<>();

    public String getStatus() { return status; }
    public void setStatus(final String status) { this.status = status; }
    public List<Item> getItems() { return items; }
    public void setItems(final List<Item> items) { this.items = items == null ? new ArrayList<>() : new ArrayList<>(items); }

    public static final class Item {
        private int index;
        private String imagePath;
        private String outputPath;
        private String status;
        private FidelityReport report;
        private List<String> blockingReasons = new ArrayList<>();

        public int getIndex() { return index; }
        public void setIndex(final int index) { this.index = index; }
        public String getImagePath() { return imagePath; }
        public void setImagePath(final String imagePath) { this.imagePath = imagePath; }
        public String getOutputPath() { return outputPath; }
        public void setOutputPath(final String outputPath) { this.outputPath = outputPath; }
        public String getStatus() { return status; }
        public void setStatus(final String status) { this.status = status; }
        public FidelityReport getReport() { return report; }
        public void setReport(final FidelityReport report) { this.report = report; }
        public List<String> getBlockingReasons() { return blockingReasons; }
        public void setBlockingReasons(final List<String> reasons) {
            this.blockingReasons = reasons == null ? new ArrayList<>() : new ArrayList<>(reasons);
        }
    }
}
