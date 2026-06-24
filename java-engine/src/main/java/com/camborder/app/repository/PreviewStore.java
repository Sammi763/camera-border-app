package com.camborder.app.repository;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * 预览资源内存存储（repository 层）。
 * 维护 previewId -> PNG 字节的映射，供预览服务写入、预览资源接口读取。
 * 单一职责：只存取字节，不做业务渲染。
 * 当前阶段使用内存存储，足够单图预览 MVP 使用，不引入缓存或持久化系统。
 *
 * 容量策略：实时预览模式下用户会频繁调参触发 POST /api/preview，
 * 若无限保留预览，内存会持续增长。因此这里维护一个有界插入顺序表，
 * 超过 maxItems 时自动淘汰最旧的预览，避免内存无限膨胀。
 * 不做磁盘缓存、不引入 Redis/DB，保持最小实现。
 */
@Component
public final class PreviewStore {

    /** 默认最多保留的预览数量，可通过 app.preview-store.max-items 覆盖。 */
    static final int DEFAULT_MAX_ITEMS = 100;

    private final int maxItems;

    /**
     * 使用 LinkedHashMap 维护插入顺序，便于按「最旧优先」淘汰。
     * 通过 Collections.synchronizedMap 包装，保证多线程并发写入/读取时
     * 不会抛 ConcurrentModificationException；removeEldestEntry 在 put 内部
     * 同步执行，淘汰逻辑本身也是线程安全的。
     */
    private final Map<String, byte[]> previews;

    public PreviewStore(
            @Value("${app.preview-store.max-items:" + DEFAULT_MAX_ITEMS + "}") final int maxItems) {
        // 非法配置（<=0）回退到默认值，避免误配置导致注册表无法保留任何预览
        this.maxItems = maxItems > 0 ? maxItems : DEFAULT_MAX_ITEMS;
        this.previews = Collections.synchronizedMap(new LinkedHashMap<String, byte[]>(16, 0.75f, false) {
            @Override
            protected boolean removeEldestEntry(final Map.Entry<String, byte[]> eldest) {
                return size() > PreviewStore.this.maxItems;
            }
        });
    }

    /**
     * 存储一份预览图字节，返回新生成的 previewId。
     * 超过容量上限时，注册表会自动淘汰最旧的预览。
     *
     * @param data 预览图 PNG 字节
     * @return 可用于 /previews/{id} 访问的 previewId
     */
    public String store(final byte[] data) {
        if (data == null) {
            throw new IllegalArgumentException("preview data must not be null");
        }
        String id = UUID.randomUUID().toString().replace("-", "");
        previews.put(id, data);
        return id;
    }

    /**
     * 按 previewId 读取预览图字节。
     *
     * @param id 预览资源 id
     * @return 预览图字节，不存在或已被淘汰时返回 empty
     */
    public Optional<byte[]> load(final String id) {
        if (id == null) {
            return Optional.empty();
        }
        return Optional.ofNullable(previews.get(id));
    }
}
