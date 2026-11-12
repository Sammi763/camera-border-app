package com.camborder.app.controller;

import com.camborder.app.dto.FilmStageCacheStatsResponse;
import com.camborder.app.repository.FilmStageCache;
import com.camborder.app.service.FilmMemoryBudgetService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 阶段缓存诊断：GET /api/film-stage-cache。
 *
 * 只读；用于性能脚本记录冷/热缓存命中率、阶段条目和预算数值。
 */
@RestController
@RequestMapping("/api")
public final class FilmStageCacheController {

    private final FilmStageCache cache;
    private final FilmMemoryBudgetService budget;

    public FilmStageCacheController(final FilmStageCache cache,
                                    final FilmMemoryBudgetService budget) {
        this.cache = cache;
        this.budget = budget;
    }

    @GetMapping("/film-stage-cache")
    public ResponseEntity<FilmStageCacheStatsResponse> stats() {
        final FilmStageCache.Stats stats = cache.stats();
        final FilmMemoryBudgetService.Snapshot snapshot = budget.snapshot();
        final FilmStageCacheStatsResponse response = new FilmStageCacheStatsResponse();
        response.setEnabled(stats.isEnabled());
        response.setCacheBytes(stats.getBytes());
        response.setCacheMaxBytes(stats.getMaxBytes());
        response.setEntries(stats.getEntries());
        response.setHits(stats.getHits());
        response.setMisses(stats.getMisses());
        response.setHitRate(stats.getHitRate());
        response.setPuts(stats.getPuts());
        response.setEvictions(stats.getEvictions());
        response.setSkipped(stats.getSkipped());
        response.setIdleMillis(stats.getIdleMillis());
        response.setBudgetTotalBytes(snapshot.getTotalBudgetBytes());
        response.setBudgetJavaBytes(snapshot.getJavaBudgetBytes());
        response.setBudgetReservedJavaBytes(snapshot.getReservedJavaBytes());
        response.setPhysicalBytes(snapshot.getPhysicalBytes());
        response.setJvmMaxHeapBytes(snapshot.getJvmMaxHeapBytes());
        return ResponseEntity.ok(response);
    }
}
