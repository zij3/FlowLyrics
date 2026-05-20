(() => {
  "use strict";

  const FRESH_TRACK_GUARD_MS = 5000;
  const STALE_HANDOFF_TIME_SECONDS = 20;
  const SCAN_INTERVAL_MS = 1300;
  const {
    LyricsOverlay,
    lyricsService,
    playerPage,
    playbackWatcher,
    trackReader,
    utils
  } = globalThis.YTML;

  const state = {
    activeIndex: -1,
    freshTrackGuardUntil: 0,
    hasSyncedLyrics: false,
    lines: [],
    loading: false,
    lyricsRequestId: 0,
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
    playbackWatcher.observePlayback({
      onPlaybackReady: scheduleScan,
      onTrackBoundary: handleTrackBoundary
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
    const video = utils.getVideo();
    const track = trackReader.readTrack();
    updatePlacement();

    if (!force && video?.ended) {
      resetTrack();
      updatePlacement();
      return;
    }

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
    state.freshTrackGuardUntil = performance.now() + FRESH_TRACK_GUARD_MS;
    clearLyrics();
    updatePlacement();
    loadLyricsForTrack(track, nextKey, ++state.lyricsRequestId);
  }

  async function loadLyricsForTrack(track, requestKey, requestId) {
    let shouldSync = false;
    state.loading = true;
    clearLyrics();
    updatePlacement();

    try {
      const lines = await lyricsService.loadSyncedLines(track, false);
      if (!isCurrentLyricsRequest(requestKey, requestId)) {
        return;
      }

      if (lines.length) {
        state.lines = lines;
        state.hasSyncedLyrics = true;
        overlay.renderLines(lines);
        shouldSync = true;
      }
    } catch (_error) {
      if (isCurrentLyricsRequest(requestKey, requestId)) {
        clearLyrics();
      }
    } finally {
      if (isCurrentLyricsRequest(requestKey, requestId)) {
        state.loading = false;
        updatePlacement();
        if (shouldSync) {
          syncToCurrentLyric(true);
        }
      }
    }
  }

  function handleTrackBoundary() {
    state.lyricsRequestId += 1;
    state.freshTrackGuardUntil = performance.now() + FRESH_TRACK_GUARD_MS;
    state.loading = false;
    resetTrack();
    updatePlacement();
  }

  function isCurrentLyricsRequest(requestKey, requestId) {
    return requestKey === state.trackKey && requestId === state.lyricsRequestId;
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
    if (!video || video.ended || !state.lines.length) {
      return;
    }

    const nextIndex = findActiveIndex(readSyncTime(video), state.lines);
    if (forceScroll || nextIndex !== state.activeIndex) {
      state.activeIndex = nextIndex;
      overlay.updateActiveLine(nextIndex, forceScroll);
    }
  }

  function readSyncTime(video) {
    const playerBarTime = trackReader.readPlaybackTime();
    const hasPlayerBarTime = Number.isFinite(playerBarTime);
    const time = hasPlayerBarTime ? playerBarTime : video.currentTime || 0;

    if (
      !hasPlayerBarTime
      && performance.now() < state.freshTrackGuardUntil
      && time > STALE_HANDOFF_TIME_SECONDS
    ) {
      return 0;
    }

    if (time <= STALE_HANDOFF_TIME_SECONDS) {
      state.freshTrackGuardUntil = 0;
    }

    return time;
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
