package com.camborder.app.repository;

import com.camborder.app.dto.RenderJobItemStatusResponse;
import com.camborder.app.dto.RenderJobSnapshot;
import com.camborder.app.dto.RenderJobStatusResponse;
import com.camborder.app.dto.SourceDecode;
import com.camborder.app.util.ImageEncoder;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Future;

/**
 * 单个批量导出任务的同步状态机。
 *
 * 所有状态推进都在 synchronized 临界区完成。GET 永远得到复制后的响应，
 * 既不会看到半次更新，也不会将内部的可变逐项结果暴露给 HTTP 序列化。
 */
public final class RenderJobRecord {

    private final String jobId;
    private final List<RenderJobSnapshot> snapshots;
    private final List<RenderJobItemStatusResponse> items;
    private boolean cancellationRequested;
    private int currentItem = -1;
    private Future<?> future;

    public RenderJobRecord(final String jobId, final List<RenderJobSnapshot> snapshots) {
        this.jobId = jobId;
        this.snapshots = List.copyOf(snapshots);
        this.items = new ArrayList<>();
        for (int index = 0; index < snapshots.size(); index++) {
            RenderJobSnapshot snapshot = snapshots.get(index);
            this.items.add(new RenderJobItemStatusResponse(
                    index,
                    snapshot.getRecipe().getImagePath(),
                    "queued"
            ));
        }
    }

    public synchronized List<RenderJobSnapshot> snapshots() {
        return snapshots;
    }

    public synchronized void setFuture(final Future<?> future) {
        this.future = future;
    }

    public synchronized boolean startItem(final int index) {
        if (cancellationRequested) {
            cancelQueuedItems();
            return false;
        }
        currentItem = index;
        items.get(index).setStatus("running");
        return true;
    }

    public synchronized boolean isCancellationRequested() {
        return cancellationRequested;
    }

    public synchronized void completeItem(final int index,
                                   final ImageEncoder.ExportResult exportResult,
                                   final SourceDecode sourceDecode) {
        RenderJobItemStatusResponse item = items.get(index);
        item.setStatus("completed");
        item.setOutputPath(exportResult.getOutputPath());
        item.setActualFormat(exportResult.getActualFormat());
        item.setMetadataPreservation(exportResult.getMetadataPreservation());
        item.setColorProfilePreservation(exportResult.getColorProfilePreservation());
        item.setHighBitDepth(exportResult.getHighBitDepth());
        item.setSourceDecode(sourceDecode);
    }

    public synchronized void failItem(final int index, final String error) {
        RenderJobItemStatusResponse item = items.get(index);
        item.setStatus("failed");
        item.setError(error);
    }

    public synchronized RenderJobStatusResponse cancel() {
        cancellationRequested = true;
        cancelQueuedItems();
        if (future != null) {
            // 不中断当前正在编码的图片；只尝试移除尚未开始的整项任务。
            future.cancel(false);
        }
        return snapshot();
    }

    private void cancelQueuedItems() {
        for (RenderJobItemStatusResponse item : items) {
            if ("queued".equals(item.getStatus())) {
                item.setStatus("cancelled");
                item.setError("任务已取消，未执行");
            }
        }
    }

    public synchronized RenderJobStatusResponse snapshot() {
        int completed = 0;
        int failed = 0;
        int cancelled = 0;
        boolean running = false;
        List<RenderJobItemStatusResponse> copiedItems = new ArrayList<>();
        for (RenderJobItemStatusResponse item : items) {
            copiedItems.add(item.copy());
            if ("completed".equals(item.getStatus())) {
                completed++;
            } else if ("failed".equals(item.getStatus())) {
                failed++;
            } else if ("cancelled".equals(item.getStatus())) {
                cancelled++;
            } else if ("running".equals(item.getStatus())) {
                running = true;
            }
        }
        int total = items.size();
        int processed = completed + failed + cancelled;
        String status;
        if (processed == total) {
            if (failed > 0) {
                status = "failed";
            } else if (cancelled > 0) {
                status = "cancelled";
            } else {
                status = "completed";
            }
        } else if (running) {
            status = "running";
        } else {
            status = "queued";
        }

        RenderJobStatusResponse response = new RenderJobStatusResponse();
        response.setJobId(jobId);
        response.setStatus(status);
        response.setMessage(messageFor(status, total, processed));
        response.setTotal(total);
        response.setCompleted(completed);
        response.setFailed(failed);
        response.setCancelled(cancelled);
        response.setProcessed(processed);
        response.setCurrentItem(running && currentItem >= 0 && currentItem < total ? currentItem + 1 : null);
        response.setItems(copiedItems);

        // 单图任务保留顶层兼容字段，便于旧客户端逐步迁移到 items[0]。
        if (total == 1) {
            RenderJobItemStatusResponse only = copiedItems.get(0);
            response.setOutputPath(only.getOutputPath());
            response.setActualFormat(only.getActualFormat());
            response.setError(only.getError());
            response.setMetadataPreservation(only.getMetadataPreservation());
            response.setColorProfilePreservation(only.getColorProfilePreservation());
            response.setHighBitDepth(only.getHighBitDepth());
            response.setSourceDecode(only.getSourceDecode());
        }
        return response;
    }

    private String messageFor(final String status, final int total, final int processed) {
        if ("completed".equals(status)) {
            return "导出任务已完成（" + total + " 张）";
        }
        if ("failed".equals(status)) {
            return "导出任务已完成，部分图片失败";
        }
        if ("cancelled".equals(status)) {
            return "导出任务已取消";
        }
        return "导出任务处理中（" + processed + "/" + total + "）";
    }
}
