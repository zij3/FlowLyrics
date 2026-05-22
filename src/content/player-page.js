(() => {
  "use strict";

  const { textFrom } = globalThis.YTML.utils;
  let nativeCloseReplayControl = null;
  let nativeCloseReplayUntil = 0;

  function observePlayerPage({
    onCloseRequested,
    onPlacementRequested,
    onPlayerTransitionRequested,
    onScanRequested
  }) {
    const requestPlacement = () => onPlacementRequested?.();
    const requestScan = () => onScanRequested?.();
    const requestClose = (detail) => onCloseRequested?.(detail);
    const requestPlayerTransition = () => onPlayerTransitionRequested?.();

    const handlePlayerAction = (event) => {
      const action = readPlayerAction(event.target);
      if (!action) {
        requestPlacement();
        return;
      }

      if (action.closes) {
        if (isNativeCloseReplay(action.control)) {
          requestPlayerTransition();
          requestPlacement();
          return;
        }

        const handled = requestClose({
          control: action.control,
          eventType: event.type
        });

        if (handled) {
          event.preventDefault();
          event.stopImmediatePropagation();
          requestPlacement();
          return;
        }
      } else if (action.opens) {
        requestPlayerTransition();
      }

      requestPlacement();
    };

    const handleKeydown = (event) => {
      if (event.key === "Escape") {
        requestPlayerTransition();
        requestPlacement();
      }
    };

    const handlePlayerTransition = (event) => {
      if (isPlacementNode(event.target)) {
        requestPlacement();
      }
    };

    document.addEventListener("visibilitychange", requestScan, true);
    document.addEventListener("pointerdown", handlePlayerAction, true);
    document.addEventListener("click", (event) => {
      handlePlayerAction(event);
      requestScan();
    }, true);
    document.addEventListener("keydown", handleKeydown, true);
    document.addEventListener("transitionend", handlePlayerTransition, true);
    document.addEventListener("animationend", handlePlayerTransition, true);
    window.addEventListener("resize", requestScan, true);

    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => isPlacementNode(mutation.target))) {
        requestPlacement();
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["aria-hidden", "aria-selected", "class", "hidden", "selected", "style"],
      childList: true,
      subtree: true
    });
  }

  function runNativeCloseAction(control) {
    const closeControl = findConnectedCloseControl(control);
    if (!closeControl || typeof closeControl.click !== "function") {
      return false;
    }

    nativeCloseReplayControl = closeControl;
    nativeCloseReplayUntil = performance.now() + 1200;
    closeControl.click();
    nativeCloseReplayControl = null;
    nativeCloseReplayUntil = 0;
    return true;
  }

  function findConnectedCloseControl(control) {
    if (control?.isConnected) {
      return control;
    }

    const controls = document.querySelectorAll(
      "ytmusic-player-page button, ytmusic-player-page tp-yt-paper-icon-button, ytmusic-player-page yt-icon-button, ytmusic-player-page yt-button-renderer, ytmusic-player-page [role='button'], ytmusic-player-page [aria-label], ytmusic-player-page [title]"
    );
    return [...controls].find((candidate) => readPlayerAction(candidate)?.closes) || null;
  }

  function isNativeCloseReplay(control) {
    return Boolean(
      nativeCloseReplayControl
      && control === nativeCloseReplayControl
      && performance.now() < nativeCloseReplayUntil
    );
  }

  function isPlayerPageOpen(playerPage) {
    if (!playerPage || !playerPage.isConnected || playerPage.matches("[hidden], [aria-hidden='true']")) {
      return false;
    }

    const playerRect = playerPage.getBoundingClientRect();
    if (!playerRect || playerRect.width <= 0 || playerRect.height <= 0) {
      return false;
    }

    const style = getComputedStyle(playerPage);
    const opacity = Number(style.opacity);

    return style.display !== "none"
      && style.visibility !== "hidden"
      && (!Number.isFinite(opacity) || opacity > 0.01)
      && playerRect.top < window.innerHeight - 120
      && playerRect.bottom > 120;
  }

  function getLyricsHostRect(playerPage) {
    const host = playerPage?.querySelector("ytmusic-tab-renderer");
    const rect = host?.getBoundingClientRect();
    if (rect && rect.width > 220 && rect.height > 220) {
      return rect;
    }

    const tabs = [...document.querySelectorAll("tp-yt-paper-tab")];
    const lyricsTab = tabs.find((tab) => /lyrics/i.test(textFrom(tab)));
    const tabRect = lyricsTab?.getBoundingClientRect();
    if (!playerPage || !playerPage.getBoundingClientRect || !tabRect) {
      return null;
    }

    const pageRect = playerPage.getBoundingClientRect();
    const left = Math.max(pageRect.left, tabRect.left - tabRect.width);
    const top = Math.min(pageRect.bottom - 240, tabRect.bottom + 8);
    const right = Math.min(pageRect.right, tabRect.right + tabRect.width);
    const bottom = Math.min(pageRect.bottom, window.innerHeight - 84);

    return {
      left,
      top,
      width: Math.max(280, right - left),
      height: Math.max(260, bottom - top)
    };
  }

  function isLyricsTabSelected() {
    return [...document.querySelectorAll("tp-yt-paper-tab")]
      .some((tab) => tab.getAttribute("aria-selected") === "true" && /lyrics/i.test(textFrom(tab)));
  }

  function isPlayerCloseAction(target) {
    return Boolean(readPlayerAction(target)?.closes);
  }

  function isPlayerPageToggleAction(target) {
    const action = readPlayerAction(target);
    return Boolean(action?.closes || action?.opens);
  }

  function readPlayerAction(target) {
    if (!target || !target.closest) {
      return null;
    }

    const control = target.closest("button, tp-yt-paper-icon-button, yt-icon-button, yt-button-renderer, [role='button'], [aria-label], [title]");
    if (!control) {
      return null;
    }

    const playerPage = target.closest("ytmusic-player-page");
    const label = [
      control.getAttribute("aria-label"),
      control.getAttribute("title"),
      control.getAttribute("data-tooltip-text"),
      control.getAttribute("tooltip"),
      control.id,
      typeof control.className === "string" ? control.className : "",
      textFrom(control)
    ].filter(Boolean).join(" ");

    const closesSomething = /\b(close|dismiss|collapse|minimi[sz]e)\b/i.test(label);
    const opensSomething = /\b(open|expand|maximi[sz]e)\b/i.test(label);
    const namesPlayerPage = /\b(player|page|full[\s-]*screen|now playing)\b/i.test(label);

    return {
      control,
      closes: closesSomething && (Boolean(playerPage) || namesPlayerPage),
      opens: opensSomething && namesPlayerPage
    };
  }

  function isPlacementNode(target) {
    if (!target || !target.matches) {
      return false;
    }

    return target === document.documentElement
      || target === document.body
      || target.matches("ytmusic-app, ytmusic-player-page, ytmusic-tab-renderer, tp-yt-paper-tab")
      || Boolean(target.closest("ytmusic-player-page, ytmusic-tab-renderer, tp-yt-paper-tab"));
  }

  globalThis.YTML.playerPage = {
    getLyricsHostRect,
    isLyricsTabSelected,
    isPlayerPageOpen,
    observePlayerPage,
    runNativeCloseAction
  };
})();
