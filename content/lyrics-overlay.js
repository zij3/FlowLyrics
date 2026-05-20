(() => {
  "use strict";

  class LyricsOverlay {
    constructor({ onShown } = {}) {
      this.elements = {};
      this.lastPlacement = "";
      this.onShown = onShown;
      this.visible = false;

      this.createInterface();
    }

    clearLines() {
      this.elements.lines.textContent = "";
      this.elements.lines.scrollTop = 0;
    }

    renderLines(lines) {
      this.clearLines();

      const fragment = document.createDocumentFragment();
      for (const [index, line] of lines.entries()) {
        const row = document.createElement("div");
        row.className = "ytml-line";
        row.dataset.index = String(index);
        row.setAttribute("role", "listitem");

        const span = document.createElement("span");
        span.textContent = line.text || "...";
        row.appendChild(span);
        fragment.appendChild(row);
      }

      this.elements.lines.appendChild(fragment);
    }

    setLoading(loading) {
      this.elements.root.classList.toggle("ytml-loading", Boolean(loading));
    }

    updatePlacement({ hostRect, playerOpen, visible }) {
      if (visible) {
        this.applyPlacement(hostRect);
      } else if (this.lastPlacement) {
        this.lastPlacement = "";
      }

      this.elements.root.classList.toggle("ytml-player-open", Boolean(playerOpen));
      this.setVisible(visible);
    }

    hideImmediately() {
      if (!this.visible) {
        return;
      }

      this.lastPlacement = "";
      this.elements.root.classList.add("ytml-fast-hide");
      this.elements.root.classList.remove("ytml-player-open");
      this.setVisible(false);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.elements.root.classList.remove("ytml-fast-hide");
        });
      });
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
        this.scrollLyricListTo(activeElement, forceScroll);
      }
    }

    createInterface() {
      const root = document.createElement("div");
      root.id = "ytml-root";
      root.innerHTML = `
        <section class="ytml-panel" aria-live="polite">
          <main class="ytml-body">
            <div class="ytml-lines" role="list"></div>
          </main>
        </section>
      `;

      (document.body || document.documentElement).appendChild(root);

      this.elements.root = root;
      this.elements.lines = root.querySelector(".ytml-lines");
    }

    setVisible(visible) {
      const wasVisible = this.visible;
      this.visible = Boolean(visible);
      this.elements.root.classList.toggle("ytml-visible", this.visible);
      document.documentElement.classList.toggle("ytml-replacing-lyrics", this.visible);

      if (this.visible && !wasVisible) {
        this.onShown?.();
      }
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
