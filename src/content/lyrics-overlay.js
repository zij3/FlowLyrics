(() => {
  "use strict";

  const PLAYER_BACKDROP_ENTER_MS = 150;
  const PLAYER_BACKDROP_EXIT_MS = 150;
  const PLAYER_BACKDROP_OPEN_DELAY_MS = 150;
  const FULLSCREEN_BOTTOM_SAFE_PX = 180;
  const { LyricsScroller } = globalThis.YTML;

  class LyricsOverlay {
    constructor({ formatOffset, onFullscreenToggle, onLineSeek, onOffsetChange, onShown } = {}) {
      this.elements = {};
      this.formatOffset = formatOffset || ((offsetSeconds) => `${offsetSeconds.toFixed(1)}s`);
      this.fullscreenActive = false;
      this.lastArtworkUrl = "";
      this.lastPlacement = "";
      this.onFullscreenToggle = onFullscreenToggle;
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
      this.scroller.clearLines();
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
      this.scroller.queueEdgeLineUpdate();
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

    updatePlacement({ fullscreenActive, hostRect, playerOpen, visible }) {
      this.setFullscreenActive(Boolean(visible && fullscreenActive));

      if (visible) {
        this.applyPlacement(hostRect);
      } else if (this.lastPlacement) {
        this.lastPlacement = "";
      }

      this.elements.root.classList.toggle("ytml-player-open", Boolean(playerOpen));
      this.updatePlayerBackdropVisibility(playerOpen);
      this.setVisible(visible);
      this.scroller.queueEdgeLineUpdate();
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
      this.scroller.updateActiveLine(activeIndex, forceScroll);
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
          <button class="ytml-fullscreen-button" type="button" aria-label="Enter fullscreen lyrics" aria-pressed="false" title="Enter fullscreen lyrics"></button>
        </section>
      `;

      (document.body || document.documentElement).appendChild(root);

      this.elements.root = root;
      this.elements.lines = root.querySelector(".ytml-lines");
      this.elements.fullscreenButton = root.querySelector(".ytml-fullscreen-button");
      this.elements.offsetValue = root.querySelector(".ytml-offset-value");
      this.scroller = new LyricsScroller({
        linesElement: this.elements.lines,
        rootElement: this.elements.root
      });

      root.querySelector(".ytml-offset").addEventListener("click", (event) => {
        const action = event.target.closest("[data-offset-action]")?.dataset.offsetAction;
        if (action) {
          this.onOffsetChange?.(action);
        }
      });

      this.elements.fullscreenButton.addEventListener("click", () => {
        this.onFullscreenToggle?.();
      });

      this.elements.lines.addEventListener("click", (event) => {
        this.handleLineActivation(event.target);
      });

      this.elements.lines.addEventListener("animationend", (event) => {
        const lineElement = event.target.closest(".ytml-line");
        if (lineElement && this.elements.lines.contains(lineElement)) {
          lineElement.classList.remove("is-entering-active", "is-leaving-active");
        }
      });

      this.elements.lines.addEventListener("scroll", () => {
        this.scroller.queueEdgeLineUpdate();
      }, { passive: true });

      this.elements.lines.addEventListener("wheel", () => {
        this.scroller.setAutoScrollActive(false);
      }, { passive: true });

      this.elements.lines.addEventListener("touchmove", () => {
        this.scroller.setAutoScrollActive(false);
      }, { passive: true });

      this.elements.lines.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          if (this.scroller.isManualScrollKey(event.key)) {
            this.scroller.setAutoScrollActive(false);
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

      this.scroller.setVisible(this.visible);
    }

    setFullscreenActive(active) {
      const fullscreenActive = Boolean(active);
      if (fullscreenActive === this.fullscreenActive) {
        return;
      }

      this.fullscreenActive = fullscreenActive;
      this.lastPlacement = "";
      this.elements.root.classList.toggle("ytml-fullscreen-active", this.fullscreenActive);
      document.documentElement.classList.toggle("ytml-fullscreen-mode", this.fullscreenActive);
      this.scroller.setFullscreenActive(this.fullscreenActive);

      if (this.elements.fullscreenButton) {
        const label = this.fullscreenActive ? "Exit fullscreen lyrics" : "Enter fullscreen lyrics";
        this.elements.fullscreenButton.setAttribute("aria-label", label);
        this.elements.fullscreenButton.setAttribute("aria-pressed", String(this.fullscreenActive));
        this.elements.fullscreenButton.title = label;
      }
    }

    applyPlacement(hostRect) {
      const rect = this.fullscreenActive ? this.getFullscreenPlacement() : hostRect;
      const placement = [
        Math.round(rect.left),
        Math.round(rect.top),
        Math.round(rect.width),
        Math.round(rect.height)
      ].join(":");

      if (placement === this.lastPlacement) {
        return;
      }

      this.lastPlacement = placement;
      this.elements.root.style.setProperty("--ytml-left", `${rect.left}px`);
      this.elements.root.style.setProperty("--ytml-top", `${rect.top}px`);
      this.elements.root.style.setProperty("--ytml-width", `${rect.width}px`);
      this.elements.root.style.setProperty("--ytml-height", `${rect.height}px`);
    }

    getFullscreenPlacement() {
      const viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
      const viewportHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);

      return {
        left: 0,
        top: 0,
        width: Math.max(320, viewportWidth),
        height: Math.max(320, viewportHeight - FULLSCREEN_BOTTOM_SAFE_PX)
      };
    }

  }

  globalThis.YTML.LyricsOverlay = LyricsOverlay;
})();
