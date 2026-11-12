package com.camborder.app.dto;

/**
 * 阶段缓存与内存预算诊断快照（GET /api/film-stage-cache）。
 *
 * 只包含进程内计数和预算数值，不含图片路径、像素或用户数据。
 */
public final class FilmStageCacheStatsResponse {
    private boolean enabled;
    private long cacheBytes;
    private long cacheMaxBytes;
    private int entries;
    private long hits;
    private long misses;
    private double hitRate;
    private long puts;
    private long evictions;
    private long skipped;
    private long idleMillis;
    private long budgetTotalBytes;
    private long budgetJavaBytes;
    private long budgetReservedJavaBytes;
    private long physicalBytes;
    private long jvmMaxHeapBytes;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(final boolean value) { enabled = value; }
    public long getCacheBytes() { return cacheBytes; }
    public void setCacheBytes(final long value) { cacheBytes = value; }
    public long getCacheMaxBytes() { return cacheMaxBytes; }
    public void setCacheMaxBytes(final long value) { cacheMaxBytes = value; }
    public int getEntries() { return entries; }
    public void setEntries(final int value) { entries = value; }
    public long getHits() { return hits; }
    public void setHits(final long value) { hits = value; }
    public long getMisses() { return misses; }
    public void setMisses(final long value) { misses = value; }
    public double getHitRate() { return hitRate; }
    public void setHitRate(final double value) { hitRate = value; }
    public long getPuts() { return puts; }
    public void setPuts(final long value) { puts = value; }
    public long getEvictions() { return evictions; }
    public void setEvictions(final long value) { evictions = value; }
    public long getSkipped() { return skipped; }
    public void setSkipped(final long value) { skipped = value; }
    public long getIdleMillis() { return idleMillis; }
    public void setIdleMillis(final long value) { idleMillis = value; }
    public long getBudgetTotalBytes() { return budgetTotalBytes; }
    public void setBudgetTotalBytes(final long value) { budgetTotalBytes = value; }
    public long getBudgetJavaBytes() { return budgetJavaBytes; }
    public void setBudgetJavaBytes(final long value) { budgetJavaBytes = value; }
    public long getBudgetReservedJavaBytes() { return budgetReservedJavaBytes; }
    public void setBudgetReservedJavaBytes(final long value) { budgetReservedJavaBytes = value; }
    public long getPhysicalBytes() { return physicalBytes; }
    public void setPhysicalBytes(final long value) { physicalBytes = value; }
    public long getJvmMaxHeapBytes() { return jvmMaxHeapBytes; }
    public void setJvmMaxHeapBytes(final long value) { jvmMaxHeapBytes = value; }
}
