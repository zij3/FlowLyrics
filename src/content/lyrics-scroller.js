(() => {
  "use strict";

  const FULLSCREEN_ACTIVE_TOP_OFFSET_PX = 220;
  const FULLSCREEN_MAX_TOP_OFFSET_RATIO = 0.36;
  const FULLSCREEN_PREVIOUS_ROW_COUNT = 3;
  const FULLSCREEN_PREVIOUS_SPACE_FALLBACK_RATIO = 1.2;
  const FULLSCREEN_ROW_GAP_MIN_PX = 18;
  const FULLSCREEN_ROW_GAP_RATIO = 0.22;
  const LYRIC_BALANCE_LOOKAROUND = 3;
  const LYRIC_BALANCE_MAX_SHIFT_PX = 84;
  const LYRIC_BALANCE_WEIGHT = 0.34;
  const MIN_VISIBLE_LINES_FOR_EDGE_FADE = 4;
  const MANUAL_SCROLL_KEYS = new Set([
    "ArrowDown",
    "ArrowUp",
    "End",
    "Home",
    "PageDown",
    "PageUp"
  ]);

  class LyricsScroller {
    constructor({ linesElement, rootElement }) {
      this.activeIndex = -1;
      this.autoScrollActive = true;
      this.edgeUpdateQueued = false;
      this.fullscreenActive = false;
      this.linesElement = linesElement;
      this.rootElement = rootElement;
      this.visible = false;

      this.setAutoScrollActive(true);
    }

    clearLines() {
      this.activeIndex = -1;
      this.linesElement.textContent = "";
      this.linesElement.scrollTop = 0;
      this.queueEdgeLineUpdate();
    }

    isManualScrollKey(key) {
      return MANUAL_SCROLL_KEYS.has(key);
    }

    setAutoScrollActive(active) {
      this.autoScrollActive = Boolean(active);
      this.rootElement.classList.toggle("ytml-autoscroll-active", this.autoScrollActive);
      this.queueEdgeLineUpdate();
    }

    setFullscreenActive(active) {
      this.fullscreenActive = Boolean(active);
      this.queueEdgeLineUpdate();
    }

    setVisible(visible) {
      this.visible = Boolean(visible);
      this.queueEdgeLineUpdate();
    }

    updateActiveLine(activeIndex, forceScroll) {
      const previousActiveIndex = this.activeIndex;
      this.activeIndex = activeIndex;

      for (const lineElement of this.linesElement.querySelectorAll(".ytml-line")) {
        const index = Number(lineElement.dataset.index);
        lineElement.classList.remove("is-entering-active", "is-leaving-active");
        lineElement.classList.toggle("is-active", index === activeIndex);
        lineElement.classList.toggle("is-past", index < activeIndex);
        lineElement.classList.toggle("is-future", index > activeIndex);
      }

      const activeElement = this.findLineElement(activeIndex);
      if (previousActiveIndex !== activeIndex) {
        this.findLineElement(previousActiveIndex)?.classList.add("is-leaving-active");
        activeElement?.classList.add("is-entering-active");
      }

      if (activeElement) {
        this.setAutoScrollActive(true);
        this.scrollToActiveLine(activeElement, forceScroll);
      }

      this.queueEdgeLineUpdate();
    }

    queueEdgeLineUpdate() {
      if (this.edgeUpdateQueued) {
        return;
      }

      this.edgeUpdateQueued = true;
      requestAnimationFrame(() => {
        this.edgeUpdateQueued = false;
        this.updateEdgeLineVisibility();
      });
    }

    updateEdgeLineVisibility() {
      const lineElements = [...this.linesElement.querySelectorAll(".ytml-line")];
      for (const lineElement of lineElements) {
        lineElement.classList.remove("is-edge-hidden");
      }

      if (
        !this.visible
        || !this.autoScrollActive
        || lineElements.length < MIN_VISIBLE_LINES_FOR_EDGE_FADE
      ) {
        return;
      }

      const containerRect = this.linesElement.getBoundingClientRect();
      const lineEntries = this.measureLineEntries(lineElements);
      const visibleLines = lineEntries
        .filter(({ rect }) => rect.bottom > containerRect.top && rect.top < containerRect.bottom);

      if (visibleLines.length < MIN_VISIBLE_LINES_FOR_EDGE_FADE) {
        return;
      }

      for (const [entry, edge] of this.getEdgeFadeTargets(lineEntries, visibleLines)) {
        this.hideEdgeLine(entry, edge, containerRect, lineElements.length);
      }
    }

    measureLineEntries(lineElements) {
      return lineElements.map((lineElement, position) => ({
        element: lineElement,
        index: Number(lineElement.dataset.index),
        position,
        rect: lineElement.getBoundingClientRect()
      }));
    }

    getEdgeFadeTargets(lineEntries, visibleLines) {
      const firstVisible = visibleLines[0];
      const lastVisible = visibleLines[visibleLines.length - 1];

      if (this.fullscreenActive) {
        return [
          [lastVisible, "bottom"],
          [lineEntries[lastVisible.position + 1], "bottom"]
        ];
      }

      return [
        [lineEntries[firstVisible.position - 1], "top"],
        [firstVisible, "top"],
        [lastVisible, "bottom"],
        [lineEntries[lastVisible.position + 1], "bottom"]
      ];
    }

    hideEdgeLine(entry, edge, containerRect, lineCount) {
      if (!entry || entry.element.classList.contains("is-active")) {
        return;
      }

      if (edge === "top" && entry.index < 2 && entry.rect.top > containerRect.top) {
        return;
      }

      if (edge === "bottom" && entry.index >= lineCount - 2) {
        return;
      }

      entry.element.classList.add("is-edge-hidden");
    }

    scrollToActiveLine(activeElement, instant) {
      const targetTop = this.fullscreenActive
        ? this.calculateFullscreenLyricTarget(activeElement)
        : activeElement.offsetTop
          - (this.linesElement.clientHeight / 2)
          + (activeElement.offsetHeight / 2)
          + this.calculateLyricBalanceShift(activeElement);

      this.linesElement.scrollTo({
        top: Math.max(0, targetTop),
        behavior: instant ? "auto" : "smooth"
      });
    }

    calculateFullscreenLyricTarget(activeElement) {
      const activeRect = activeElement.getBoundingClientRect();
      const previousRows = this.getPreviousLyricRows(activeElement, FULLSCREEN_PREVIOUS_ROW_COUNT);
      const previousSpace = previousRows.length
        ? previousRows.reduce((total, row) => total + row.height, 0)
          + (previousRows.length * this.getFullscreenRowGap(activeRect.height))
        : activeElement.offsetHeight * FULLSCREEN_PREVIOUS_SPACE_FALLBACK_RATIO;
      const topOffset = Math.min(
        this.linesElement.clientHeight * FULLSCREEN_MAX_TOP_OFFSET_RATIO,
        Math.max(FULLSCREEN_ACTIVE_TOP_OFFSET_PX, previousSpace)
      );

      return activeElement.offsetTop - topOffset;
    }

    getFullscreenRowGap(activeLineHeight) {
      return Math.max(FULLSCREEN_ROW_GAP_MIN_PX, activeLineHeight * FULLSCREEN_ROW_GAP_RATIO);
    }

    getPreviousLyricRows(activeElement, count) {
      const rows = [];
      let previousElement = activeElement.previousElementSibling;

      while (previousElement && rows.length < count) {
        if (previousElement.classList?.contains("ytml-line")) {
          const rect = previousElement.getBoundingClientRect();
          rows.push({
            height: rect.height || previousElement.offsetHeight || 0
          });
        }
        previousElement = previousElement.previousElementSibling;
      }

      return rows;
    }

    calculateLyricBalanceShift(activeElement) {
      const activeIndex = Number(activeElement?.dataset?.index);
      if (!Number.isInteger(activeIndex)) {
        return 0;
      }

      const above = this.measureNeighborLyricHeight(activeIndex, -1);
      const below = this.measureNeighborLyricHeight(activeIndex, 1);
      if (!above.count || !below.count) {
        return 0;
      }

      const aboveAverage = above.height / above.count;
      const belowAverage = below.height / below.count;
      const comparedRows = Math.min(LYRIC_BALANCE_LOOKAROUND, above.count, below.count);
      const shift = (aboveAverage - belowAverage) * comparedRows * LYRIC_BALANCE_WEIGHT;

      return Math.max(-LYRIC_BALANCE_MAX_SHIFT_PX, Math.min(LYRIC_BALANCE_MAX_SHIFT_PX, shift));
    }

    measureNeighborLyricHeight(activeIndex, direction) {
      let count = 0;
      let height = 0;

      for (let step = 1; step <= LYRIC_BALANCE_LOOKAROUND; step += 1) {
        const index = activeIndex + (step * direction);
        const lineElement = this.findLineElement(index);
        if (!lineElement) {
          continue;
        }

        const rect = lineElement.getBoundingClientRect();
        height += rect.height || lineElement.offsetHeight || 0;
        count += 1;
      }

      return { count, height };
    }

    findLineElement(index) {
      return this.linesElement.querySelector(`.ytml-line[data-index="${index}"]`);
    }
  }

  globalThis.YTML.LyricsScroller = LyricsScroller;
})();
