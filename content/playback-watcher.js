(() => {
  "use strict";

  function observePlayback({
    onPlaybackReady,
    onTrackBoundary
  }) {
    let playbackQueued = false;

    const schedulePlaybackReady = () => {
      if (playbackQueued) {
        return;
      }

      playbackQueued = true;
      requestAnimationFrame(() => {
        playbackQueued = false;
        onPlaybackReady?.();
      });
    };

    const handleTrackBoundary = () => {
      onTrackBoundary?.();
      schedulePlaybackReady();
    };

    document.addEventListener("ended", handleTrackBoundary, true);
    document.addEventListener("emptied", handleTrackBoundary, true);
    document.addEventListener("loadedmetadata", schedulePlaybackReady, true);
    document.addEventListener("durationchange", schedulePlaybackReady, true);
    document.addEventListener("play", schedulePlaybackReady, true);
    document.addEventListener("playing", schedulePlaybackReady, true);

    const observer = new MutationObserver((mutations) => {
      if (mutations.some(mutationTouchesPlayerBar)) {
        schedulePlaybackReady();
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["title"],
      characterData: true,
      childList: true,
      subtree: true
    });
  }

  function mutationTouchesPlayerBar(mutation) {
    return nodeTouchesPlayerBar(mutation.target)
      || nodeListTouchesPlayerBar(mutation.addedNodes)
      || nodeListTouchesPlayerBar(mutation.removedNodes);
  }

  function nodeListTouchesPlayerBar(nodes) {
    return [...nodes].some(nodeTouchesPlayerBar);
  }

  function nodeTouchesPlayerBar(node) {
    if (!node) {
      return false;
    }

    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return Boolean(element?.closest?.("ytmusic-player-bar"));
  }

  globalThis.YTML.playbackWatcher = {
    observePlayback
  };
})();
