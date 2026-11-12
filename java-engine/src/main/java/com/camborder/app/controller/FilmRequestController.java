package com.camborder.app.controller;

import com.camborder.app.exception.ApiException;
import com.camborder.app.service.FilmTaskScheduler;
import com.camborder.app.util.FilmRequestGuard;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 取消工作台视图的底片交互任务：DELETE /api/film-requests/{clientId}?generation=n。
 *
 * 只取消不高于指定代次的交互任务（等待与执行中），幂等返回 204；不会取消导出项。
 * 旧取消请求不会误伤更高代次的新任务。
 */
@RestController
@RequestMapping("/api")
public final class FilmRequestController {

    private final FilmTaskScheduler scheduler;

    public FilmRequestController(final FilmTaskScheduler scheduler) {
        this.scheduler = scheduler;
    }

    @DeleteMapping("/film-requests/{clientId}")
    public ResponseEntity<Void> cancel(@PathVariable final String clientId,
                                       @RequestParam(defaultValue = "0") final long generation) {
        if (clientId == null || !clientId.matches("[A-Za-z0-9_-]{1,80}") || generation < 0) {
            throw new ApiException("底片请求代次非法", HttpStatus.BAD_REQUEST, "FILM_REQUEST_INVALID");
        }
        scheduler.cancel(clientId, generation);
        FilmRequestGuard.cancelUpTo(clientId, generation);
        return ResponseEntity.noContent().build();
    }
}
