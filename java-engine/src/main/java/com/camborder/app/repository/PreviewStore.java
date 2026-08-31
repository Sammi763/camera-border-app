package com.camborder.app.repository;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * 预览资源内存存储（repository 层）。
 * 维护 previewId -> PNG 字节的映射，供预览服务写入、预览资源接口读取。
 * 单一职责：只存取字节，不做业务渲染。
 * 当前阶段使用内存存储，不引入缓存服务或持久化系统。
 *
 * 容量策略：实时预览模式下用户会频繁调参触发 POST /api/preview，
 * 若无限保留预览，内存会持续增长。因此这里同时按条目数和 PNG 字节数维护 LRU，
 * 任一上限触发时自动淘汰最久未访问预览。缓存只保存已编码 PNG 字节，绝不保存
 * 完整分辨率 BufferedImage。
 */
@Component
public final class PreviewStore {

    /** 默认最多保留的预览数量，可通过 app.preview-store.max-items 覆盖。 */
    static final int DEFAULT_MAX_ITEMS = 100;
    /** 默认最多保留的预览字节数（32 MiB），可通过 app.preview-store.max-bytes 覆盖。 */
    static final long DEFAULT_MAX_BYTES = 32L * 1024L * 1024L;

    private final int maxItems;
    private final long maxBytes;
    private long storedBytes;

    /**
     * accessOrder=true 使读取也会刷新最近使用顺序。所有访问在 synchronized 方法内，
     * 让字节计数与映射更新保持原子一致。
     */
    private final Map<String, byte[]> previews;

    @Autowired
    public PreviewStore(
            @Value("${app.preview-store.max-items:" + DEFAULT_MAX_ITEMS + "}") final int maxItems,
            @Value("${app.preview-store.max-bytes:" + DEFAULT_MAX_BYTES + "}") final long maxBytes) {
        // 非法配置（<=0）回退到默认值，避免误配置导致注册表无法保留任何预览
        this.maxItems = maxItems > 0 ? maxItems : DEFAULT_MAX_ITEMS;
        this.maxBytes = maxBytes > 0 ? maxBytes : DEFAULT_MAX_BYTES;
        this.previews = new LinkedHashMap<>(16, 0.75f, true);
        this.storedBytes = 0L;
    }

    /** 兼容既有单参数测试和调用；生产配置仍走带 @Value 的构造器。 */
    public PreviewStore(final int maxItems) {
        this(maxItems, DEFAULT_MAX_BYTES);
    }

    /**
     * 存储一份预览图字节，返回新生成的 previewId。
     * 超过条目或字节上限时，注册表会自动淘汰最久未访问的预览。
     *
     * @param data 预览图 PNG 字节
     * @return 可用于 /previews/{id} 访问的 previewId
     */
    public synchronized String store(final byte[] data) {
        if (data == null) {
            throw new IllegalArgumentException("preview data must not be null");
        }
        if (data.length > maxBytes) {
            throw new IllegalArgumentException("preview data exceeds preview store byte budget");
        }
        String id = UUID.randomUUID().toString().replace("-", "");
        previews.put(id, data);
        storedBytes += data.length;
        evictToBudget();
        return id;
    }

    /**
     * 按 previewId 读取预览图字节。
     *
     * @param id 预览资源 id
     * @return 预览图字节，不存在或已被淘汰时返回 empty
     */
    public synchronized Optional<byte[]> load(final String id) {
        if (id == null) {
            return Optional.empty();
        }
        return Optional.ofNullable(previews.get(id));
    }

    /** 当前缓存字节数，仅供同包单元测试验证预算不变量。 */
    synchronized long storedByteCount() {
        return storedBytes;
    }

    /** 在同一把锁内按 LRU 淘汰，确保条目数与字节预算同时成立。 */
    private void evictToBudget() {
        final Iterator<Map.Entry<String, byte[]>> entries = previews.entrySet().iterator();
        while ((previews.size() > maxItems || storedBytes > maxBytes) && entries.hasNext()) {
            final Map.Entry<String, byte[]> eldest = entries.next();
            storedBytes -= eldest.getValue().length;
            entries.remove();
        }
    }
}
