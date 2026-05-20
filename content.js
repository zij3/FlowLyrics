(() => {
  "use strict";

  const SCAN_INTERVAL_MS = 1300;
  const {
    LyricsOverlay,
    lyricsService,
    playerPage,
    trackReader,
    utils
  } = globalThis.YTML;

  const state = {
    activeIndex: -1,
    hasSyncedLyrics: false,
    lines: [],
    loading: false,
    placementQueued: false,
    rafId: 0,
    scanQueued: false,
    track: null,
    trackKey: ""
  };

  const overlay = new LyricsOverlay({
    onShown: () => syncToCurrentLyric(true)
  });

  init();

  function init() {
    playerPage.observePlayerPage({
      onCloseRequested: () => overlay.hideImmediately(),
      onPlacementRequested: schedulePlacementUpdate,
      onScanRequested: scheduleScan
    });

    scanTrack(true);
    setInterval(() => scanTrack(false), SCAN_INTERVAL_MS);
    state.rafId = requestAnimationFrame(syncLoop);
  }

  function scheduleScan() {
    if (state.scanQueued) {
      return;
    }

    state.scanQueued = true;
    requestAnimationFrame(() => {
      state.scanQueued = false;
      scanTrack(false);
      updatePlacement();
    });
  }

  function schedulePlacementUpdate() {
    if (state.placementQueued) {
      return;
    }

    state.placementQueued = true;
    requestAnimationFrame(() => {
      state.placementQueued = false;
      updatePlacement();
    });
  }

  function scanTrack(force) {
    const track = trackReader.readTrack();
    updatePlacement();

    if (!track.title || !track.artist) {
      resetTrack();
      updatePlacement();
      return;
    }

    const nextKey = utils.buildTrackKey(track);
    if (!force && nextKey === state.trackKey) {
      return;
    }

    state.track = track;
    state.trackKey = nextKey;
    clearLyrics();
    updatePlacement();
    loadLyricsForTrack(track, nextKey);
  }

  async function loadLyricsForTrack(track, requestKey) {
    state.loading = true;
    clearLyrics();
    updatePlacement();

    try {
      const lines = await lyricsService.loadSyncedLines(track, false);
      if (requestKey !== state.trackKey) {
        return;
      }

      if (lines.length) {
        state.lines = lines;
        state.hasSyncedLyrics = true;
        overlay.renderLines(lines);
      }
    } catch (_error) {
      if (requestKey === state.trackKey) {
        clearLyrics();
      }
    } finally {
      if (requestKey === state.trackKey) {
        state.loading = false;
        updatePlacement();
      }
    }
  }

  function resetTrack() {
    state.track = null;
    state.trackKey = "";
    state.loading = false;
    clearLyrics();
  }

  function clearLyrics() {
    state.activeIndex = -1;
    state.hasSyncedLyrics = false;
    state.lines = [];
    overlay.clearLines();
  }

  function syncLoop() {
    syncToCurrentLyric(false);
    state.rafId = requestAnimationFrame(syncLoop);
  }

  function syncToCurrentLyric(forceScroll) {
    const video = utils.getVideo();
    if (!video || !state.lines.length) {
      return;
    }

    const nextIndex = findActiveIndex(video.currentTime || 0, state.lines);
    if (forceScroll || nextIndex !== state.activeIndex) {
      state.activeIndex = nextIndex;
      overlay.updateActiveLine(nextIndex, forceScroll);
    }
  }

  function findActiveIndex(time, lines) {
    let low = 0;
    let high = lines.length - 1;
    let answer = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (lines[mid].time <= time) {
        answer = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return answer;
  }

  function updatePlacement() {
    const playerPageElement = document.querySelector("ytmusic-player-page");
    const playerOpen = playerPage.isPlayerPageOpen(playerPageElement);
    const lyricsSelected = playerPage.isLyricsTabSelected();
    const hostRect = playerPage.getLyricsHostRect(playerPageElement);
    const visible = Boolean(playerOpen && lyricsSelected && hostRect && state.hasSyncedLyrics && state.lines.length);

    overlay.setLoading(state.loading);
    overlay.updatePlacement({
      hostRect,
      playerOpen,
      visible
    });
  }
})();
