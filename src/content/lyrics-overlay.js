(() => {
  "use strict";

  const PLAYER_BACKDROP_ENTER_MS = 150;
  const PLAYER_BACKDROP_EXIT_MS = 150;
  const PLAYER_BACKDROP_OPEN_DELAY_MS = 150;

  class LyricsOverlay {
    constructor({ formatOffset, onLineSeek, onOffsetChange, onShown } = {}) {
      this.autoScrollActive = true;
      this.edgeUpdateQueued = false;
      this.elements = {};
      this.formatOffset = formatOffset || ((offsetSeconds) => `${offsetSeconds.toFixed(1)}s`);
      this.lastArtworkUrl = "";
      this.lastPlacement = "";
      this.onLineSeek = onLineSeek;
      this.onOffsetChange = onOffsetChange;
      this.onShown = onShown;
      this.playerBackdropEnterTimerId = 0;
      this.playerBackdropExitTimerId = 0;
      this.playerBackdropOpenTimerId = 0;
      this.playerCloseFading = false;
      this.visible = false;

      this.createInterface();
    }

    clearLines() {
      this.elements.lines.textContent = "";
      this.elements.lines.scrollTop = 0;
      this.queueEdgeLineUpdate();
    }

    renderLines(lines) {
      this.clearLines();

      const fragment = document.createDocumentFragment();
      for (const [index, line] of lines.entries()) {
        const row = document.createElement("div");
        row.className = "ytml-line";
        row.dataset.index = String(index);
        row.setAttribute("role", "listitem");
        row.tabIndex = 0;
        row.setAttribute("aria-label", `Seek to lyric: ${line.text || "..."}`);
        row.title = "Seek to this lyric";

        const span = document.createElement("span");
        span.textContent = line.text || "...";
        row.appendChild(span);
        fragment.appendChild(row);
      }

      this.elements.lines.appendChild(fragment);
      this.queueEdgeLineUpdate();
    }

    setLoading(loading) {
      this.elements.root.classList.toggle("ytml-loading", Boolean(loading));
    }

    setOffset(offsetSeconds) {
      this.elements.offsetValue.textContent = this.formatOffset(offsetSeconds);
    }

    setOffsetControlsVisible(visible) {
      this.elements.root.classList.toggle("ytml-has-offset-controls", Boolean(visible));
    }

    setArtworkUrl(artworkUrl) {
      const nextArtworkUrl = String(artworkUrl || "");
      if (nextArtworkUrl === this.lastArtworkUrl) {
        return;
      }

      this.lastArtworkUrl = nextArtworkUrl;
      this.elements.root.classList.toggle("ytml-has-artwork", Boolean(nextArtworkUrl));
      document.documentElement.classList.toggle("ytml-has-artwork", Boolean(nextArtworkUrl));
      if (nextArtworkUrl) {
        this.elements.root.style.setProperty("--ytml-artwork-url", `url(${JSON.stringify(nextArtworkUrl)})`);
        document.documentElement.style.setProperty("--ytml-artwork-url", `url(${JSON.stringify(nextArtworkUrl)})`);
      } else {
        this.elements.root.style.removeProperty("--ytml-artwork-url");
        document.documentElement.style.removeProperty("--ytml-artwork-url");
      }
      this.updatePlayerBackdropVisibility();
    }

    updatePlacement({ hostRect, playerOpen, visible }) {
      if (visible) {
        this.applyPlacement(hostRect);
      } else if (this.lastPlacement) {
        this.lastPlacement = "";
      }

      this.elements.root.classList.toggle("ytml-player-open", Boolean(playerOpen));
      this.updatePlayerBackdropVisibility(playerOpen);
      this.setVisible(visible);
      this.queueEdgeLineUpdate();
    }

    hideImmediately() {
      this.elements.root.classList.remove("ytml-player-open");
      this.updatePlayerBackdropVisibility(false);

      if (!this.visible) {
        return;
      }

      this.lastPlacement = "";
      this.elements.root.classList.add("ytml-fast-hide");
      this.setVisible(false);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.elements.root.classList.remove("ytml-fast-hide");
        });
      });
    }

    startPlayerCloseFade() {
      const html = document.documentElement;
      const backdropActive = html.classList.contains("ytml-player-backdrop-active")
        || html.classList.contains("ytml-player-backdrop-entering");
      const shouldDelayClose = backdropActive || this.visible;

      if (!shouldDelayClose) {
        this.deactivatePlayerBackdrop();
        return 0;
      }

      this.playerCloseFading = true;
      this.elements.root.classList.remove("ytml-player-open");
      this.elements.root.classList.add("ytml-player-closing");
      this.lastPlacement = "";
      this.setVisible(false);

      if (this.playerBackdropOpenTimerId) {
        clearTimeout(this.playerBackdropOpenTimerId);
        this.playerBackdropOpenTimerId = 0;
      }

      if (this.playerBackdropEnterTimerId) {
        clearTimeout(this.playerBackdropEnterTimerId);
        this.playerBackdropEnterTimerId = 0;
      }

      if (backdropActive) {
        html.classList.remove("ytml-player-backdrop-active", "ytml-player-backdrop-entering");
        html.classList.add("ytml-player-backdrop-exiting");
      }

      if (this.playerBackdropExitTimerId) {
        clearTimeout(this.playerBackdropExitTimerId);
      }

      this.playerBackdropExitTimerId = setTimeout(() => {
        this.playerBackdropExitTimerId = 0;
        this.playerCloseFading = false;
        this.elements.root.classList.remove("ytml-player-closing");
        html.classList.remove("ytml-player-backdrop-exiting");
      }, PLAYER_BACKDROP_EXIT_MS + 80);

      return PLAYER_BACKDROP_EXIT_MS;
    }

    updateActiveLine(activeIndex, forceScroll) {
      for (const lineElement of this.elements.lines.querySelectorAll(".ytml-line")) {
        const index = Number(lineElement.dataset.index);
        lineElement.classList.toggle("is-active", index === activeIndex);
        lineElement.classList.toggle("is-past", index < activeIndex);
        lineElement.classList.toggle("is-future", index > activeIndex);
      }

      const activeElement = this.elements.lines.querySelector(`.ytml-line[data-index="${activeIndex}"]`);
      if (activeElement) {
        this.setAutoScrollActive(true);
        this.scrollLyricListTo(activeElement, forceScroll);
      }
      this.queueEdgeLineUpdate();
    }

    createInterface() {
      const root = document.createElement("div");
      root.id = "ytml-root";
      root.innerHTML = `
        <section class="ytml-panel" aria-live="polite">
          <div class="ytml-offset" aria-label="Lyric timing offset">
            <button class="ytml-offset-button ytml-offset-jump" type="button" data-offset-action="decrease-large" aria-label="Show lyrics 1 second earlier" title="Show lyrics 1 second earlier">-1s</button>
            <button class="ytml-offset-button" type="button" data-offset-action="decrease" aria-label="Show lyrics 0.1 seconds earlier" title="Show lyrics 0.1 seconds earlier">-</button>
            <button class="ytml-offset-value" type="button" data-offset-action="reset" aria-label="Reset lyric offset" title="Reset lyric offset">0.0s</button>
            <button class="ytml-offset-button" type="button" data-offset-action="increase" aria-label="Show lyrics 0.1 seconds later" title="Show lyrics 0.1 seconds later">+</button>
            <button class="ytml-offset-button ytml-offset-jump" type="button" data-offset-action="increase-large" aria-label="Show lyrics 1 second later" title="Show lyrics 1 second later">+1s</button>
          </div>
          <main class="ytml-body">
            <div class="ytml-lines" role="list"></div>
          </main>
        </section>
      `;

      (document.body || document.documentElement).appendChild(root);

      this.elements.root = root;
      this.elements.lines = root.querySelector(".ytml-lines");
      this.elements.offsetValue = root.querySelector(".ytml-offset-value");
      this.setAutoScrollActive(true);

      root.querySelector(".ytml-offset").addEventListener("click", (event) => {
        const action = event.target.closest("[data-offset-action]")?.dataset.offsetAction;
        if (action) {
          this.onOffsetChange?.(action);
        }
      });

      this.elements.lines.addEventListener("click", (event) => {
        this.handleLineActivation(event.target);
      });

      this.elements.lines.addEventListener("scroll", () => {
        this.queueEdgeLineUpdate();
      }, { passive: true });

      this.elements.lines.addEventListener("wheel", () => {
        this.setAutoScrollActive(false);
      }, { passive: true });

      this.elements.lines.addEventListener("touchmove", () => {
        this.setAutoScrollActive(false);
      }, { passive: true });

      this.elements.lines.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          if (this.isManualScrollKey(event.key)) {
            this.setAutoScrollActive(false);
          }
          return;
        }

        const lineElement = event.target.closest(".ytml-line");
        if (!lineElement || !this.elements.lines.contains(lineElement)) {
          return;
        }

        event.preventDefault();
        this.handleLineActivation(lineElement);
      });
    }

    handleLineActivation(target) {
      const lineElement = target?.closest?.(".ytml-line");
      if (!lineElement || !this.elements.lines.contains(lineElement)) {
        return;
      }

      const index = Number(lineElement.dataset.index);
      if (Number.isInteger(index)) {
        this.onLineSeek?.(index);
      }
    }

    setAutoScrollActive(active) {
      this.autoScrollActive = Boolean(active);
      this.elements.root.classList.toggle("ytml-autoscroll-active", this.autoScrollActive);
      this.queueEdgeLineUpdate();
    }

    isManualScrollKey(key) {
      return [
        "ArrowDown",
        "ArrowUp",
        "End",
        "Home",
        "PageDown",
        "PageUp"
      ].includes(key);
    }

    updatePlayerBackdropVisibility(playerOpen = this.elements.root.classList.contains("ytml-player-open")) {
      if (this.playerCloseFading) {
        return;
      }

      const shouldShowBackdrop = Boolean(playerOpen && this.lastArtworkUrl);
      if (!shouldShowBackdrop) {
        this.deactivatePlayerBackdrop();
        return;
      }

      if (
        this.playerBackdropOpenTimerId
        || document.documentElement.classList.contains("ytml-player-backdrop-active")
      ) {
        return;
      }

      this.playerBackdropOpenTimerId = setTimeout(() => {
        this.playerBackdropOpenTimerId = 0;
        if (this.elements.root.classList.contains("ytml-player-open") && this.lastArtworkUrl) {
          this.activatePlayerBackdrop();
        }
      }, PLAYER_BACKDROP_OPEN_DELAY_MS);
    }

    activatePlayerBackdrop() {
      const html = document.documentElement;
      if (this.playerBackdropEnterTimerId) {
        clearTimeout(this.playerBackdropEnterTimerId);
      }

      if (this.playerBackdropExitTimerId) {
        clearTimeout(this.playerBackdropExitTimerId);
        this.playerBackdropExitTimerId = 0;
      }

      this.playerCloseFading = false;
      this.elements.root.classList.remove("ytml-player-closing");
      html.classList.remove("ytml-player-backdrop-exiting");
      html.classList.add("ytml-player-backdrop-active", "ytml-player-backdrop-entering");
      this.playerBackdropEnterTimerId = setTimeout(() => {
        this.playerBackdropEnterTimerId = 0;
        html.classList.remove("ytml-player-backdrop-entering");
      }, PLAYER_BACKDROP_ENTER_MS);
    }

    deactivatePlayerBackdrop() {
      if (this.playerBackdropOpenTimerId) {
        clearTimeout(this.playerBackdropOpenTimerId);
        this.playerBackdropOpenTimerId = 0;
      }

      if (this.playerBackdropEnterTimerId) {
        clearTimeout(this.playerBackdropEnterTimerId);
        this.playerBackdropEnterTimerId = 0;
      }

      if (this.playerBackdropExitTimerId) {
        clearTimeout(this.playerBackdropExitTimerId);
        this.playerBackdropExitTimerId = 0;
      }

      this.playerCloseFading = false;
      this.elements.root.classList.remove("ytml-player-closing");
      document.documentElement.classList.remove(
        "ytml-player-backdrop-active",
        "ytml-player-backdrop-entering",
        "ytml-player-backdrop-exiting"
      );
    }

    setVisible(visible) {
      const wasVisible = this.visible;
      this.visible = Boolean(visible);
      this.elements.root.classList.toggle("ytml-visible", this.visible);
      document.documentElement.classList.toggle("ytml-replacing-lyrics", this.visible);

      if (this.visible && !wasVisible) {
        this.onShown?.();
      }

      this.queueEdgeLineUpdate();
    }

    applyPlacement(hostRect) {
      const placement = [
        Math.round(hostRect.left),
        Math.round(hostRect.top),
        Math.round(hostRect.width),
        Math.round(hostRect.height)
      ].join(":");

      if (placement === this.lastPlacement) {
        return;
      }

      this.lastPlacement = placement;
      this.elements.root.style.setProperty("--ytml-left", `${hostRect.left}px`);
      this.elements.root.style.setProperty("--ytml-top", `${hostRect.top}px`);
      this.elements.root.style.setProperty("--ytml-width", `${hostRect.width}px`);
      this.elements.root.style.setProperty("--ytml-height", `${hostRect.height}px`);
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
      const lineElements = [...this.elements.lines.querySelectorAll(".ytml-line")];
      for (const lineElement of lineElements) {
        lineElement.classList.remove("is-edge-hidden");
      }

      if (!this.visible || !this.autoScrollActive || lineElements.length < 4) {
        return;
      }

      const containerRect = this.elements.lines.getBoundingClientRect();
      const lineEntries = lineElements.map((lineElement, position) => ({
        element: lineElement,
        index: Number(lineElement.dataset.index),
        position,
        rect: lineElement.getBoundingClientRect()
      }));
      const visibleLines = lineEntries
        .filter(({ rect }) => rect.bottom > containerRect.top && rect.top < containerRect.bottom);

      if (visibleLines.length < 4) {
        return;
      }

      const firstVisible = visibleLines[0];
      const lastVisible = visibleLines[visibleLines.length - 1];
      const edgeLines = [
        [lineEntries[firstVisible.position - 1], "top"],
        [firstVisible, "top"],
        [lastVisible, "bottom"],
        [lineEntries[lastVisible.position + 1], "bottom"]
      ];

      for (const [entry, edge] of edgeLines) {
        this.hideEdgeLine(entry, edge, containerRect, lineElements.length);
      }
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

    scrollLyricListTo(activeElement, instant) {
      const targetTop = activeElement.offsetTop
        - (this.elements.lines.clientHeight / 2)
        + (activeElement.offsetHeight / 2);

      this.elements.lines.scrollTo({
        top: Math.max(0, targetTop),
        behavior: instant ? "auto" : "smooth"
      });
    }
  }

  globalThis.YTML.LyricsOverlay = LyricsOverlay;
})();
