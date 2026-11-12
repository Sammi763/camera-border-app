package com.camborder.app.util;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
final class FilmRequestGuardTest {
    @Test void completedRequestCanRetrySameGeneration() {
        try(FilmRequestGuard.Scope first = FilmRequestGuard.open("guard_retry",1)) { FilmRequestGuard.check(); }
        try(FilmRequestGuard.Scope retry = FilmRequestGuard.open("guard_retry",1)) { FilmRequestGuard.check(); }
        assertThatThrownBy(()->FilmRequestGuard.open("guard_retry",0)).hasMessageContaining("取消");
        assertThatCode(FilmRequestGuard::check).doesNotThrowAnyException();
    }
    @Test void newerGenerationCancelsOldAndScopeDoesNotLeakThreadState() {
        try (FilmRequestGuard.Scope old = FilmRequestGuard.open("guard_test",1)) {
            try(FilmRequestGuard.Scope latest = FilmRequestGuard.open("guard_test",2)) { FilmRequestGuard.check(); }
            assertThatThrownBy(FilmRequestGuard::check).hasMessageContaining("取消");
        }
        assertThatCode(FilmRequestGuard::check).doesNotThrowAnyException();
        assertThatThrownBy(() -> FilmRequestGuard.open("invalid client",0)).hasMessageContaining("非法");
    }

    @Test void sameGenerationAllowsPreviewAndAnalysisCollaboration() {
        try (FilmRequestGuard.Scope preview = FilmRequestGuard.open("guard_same", 5)) {
            try (FilmRequestGuard.Scope analysis = FilmRequestGuard.open("guard_same", 5)) {
                FilmRequestGuard.check();
            }
            FilmRequestGuard.check();
        }
    }

    @Test void cancelUpToCancelsOldTokensButLeavesNewerGeneration() {
        final Thread oldThread = new Thread(() -> {
            try (FilmRequestGuard.Scope ignored = FilmRequestGuard.open("guard_cancel", 1)) {
                try { Thread.sleep(200); } catch (InterruptedException exception) { Thread.currentThread().interrupt(); }
                FilmRequestGuard.check();
            } catch (RuntimeException expected) {
                // expected cancellation
            }
        });
        oldThread.start();
        try {
            Thread.sleep(50);
            FilmRequestGuard.cancelUpTo("guard_cancel", 1);
            oldThread.join(2000);
            org.assertj.core.api.Assertions.assertThat(oldThread.isAlive()).isFalse();
            try (FilmRequestGuard.Scope newer = FilmRequestGuard.open("guard_cancel", 2)) {
                FilmRequestGuard.check();
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new AssertionError(exception);
        }
    }
}
