(() => {
  "use strict";

  const STORAGE_KEY = "ytml.lyricOffsetSeconds";
  const MIN_OFFSET_SECONDS = -10;
  const MAX_OFFSET_SECONDS = 10;
  const STEP_SECONDS = 0.1;
  const JUMP_SECONDS = 1;

  function loadOffset() {
    try {
      return clampOffset(Number(localStorage.getItem(STORAGE_KEY) || 0));
    } catch (_error) {
      return 0;
    }
  }

  function saveOffset(offsetSeconds) {
    const offset = clampOffset(offsetSeconds);

    try {
      localStorage.setItem(STORAGE_KEY, String(offset));
    } catch (_error) {
      // The offset still works for the current page when storage is unavailable.
    }

    return offset;
  }

  function adjustOffset(currentOffset, direction, stepSeconds = STEP_SECONDS) {
    const nextOffset = currentOffset + direction * stepSeconds;
    return clampOffset(Math.round(nextOffset * 10) / 10);
  }

  function clampOffset(offsetSeconds) {
    if (!Number.isFinite(offsetSeconds)) {
      return 0;
    }

    return Math.min(MAX_OFFSET_SECONDS, Math.max(MIN_OFFSET_SECONDS, offsetSeconds));
  }

  function formatOffset(offsetSeconds) {
    if (!offsetSeconds) {
      return "0.0s";
    }

    return `${offsetSeconds > 0 ? "+" : ""}${offsetSeconds.toFixed(1)}s`;
  }

  globalThis.YTML.offsetController = {
    adjustOffset,
    formatOffset,
    JUMP_SECONDS,
    loadOffset,
    saveOffset
  };
})();
